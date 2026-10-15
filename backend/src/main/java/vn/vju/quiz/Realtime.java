package vn.vju.quiz;

import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.*;
import org.springframework.messaging.simp.config.*;
import org.springframework.messaging.simp.stomp.*;
import org.springframework.messaging.support.*;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.security.core.Authentication;
import org.springframework.web.socket.*;
import org.springframework.web.socket.config.annotation.*;
import org.springframework.web.socket.handler.WebSocketHandlerDecorator;
import vn.vju.quiz.Domain.*;

@Configuration
@EnableWebSocketMessageBroker
public class Realtime implements WebSocketMessageBrokerConfigurer {
  final Store s;
  final String origin;
  final Map<String, SocketState> sockets = new HashMap<>();

  static class SocketState {
    final String actorId;
    final WebSocketSession session;
    final Map<String, String> subscriptions = new HashMap<>();
    long window = System.currentTimeMillis();
    int commands;

    SocketState(String actorId, WebSocketSession session) {
      this.actorId = actorId;
      this.session = session;
    }
  }

  Actor actor(java.security.Principal principal) {
    return principal instanceof Authentication a && a.getPrincipal() instanceof Actor p ? p : null;
  }

  public void configureWebSocketTransport(WebSocketTransportRegistration registration) {
    registration
        .setMessageSizeLimit(8192)
        .setSendBufferSizeLimit(65536)
        .setSendTimeLimit(10000)
        .setTimeToFirstMessage(10000);
    registration.addDecoratorFactory(
        delegate ->
            new WebSocketHandlerDecorator(delegate) {
              public void afterConnectionEstablished(WebSocketSession session) throws Exception {
                Actor a = actor(session.getPrincipal());
                synchronized (sockets) {
                  if (a == null
                      || sockets.size() >= 512
                      || sockets.values().stream().filter(x -> x.actorId.equals(a.id())).count()
                          >= 4) {
                    session.close(CloseStatus.POLICY_VIOLATION);
                    return;
                  }
                  sockets.put(session.getId(), new SocketState(a.id(), session));
                }
                try {
                  super.afterConnectionEstablished(session);
                } catch (Exception e) {
                  release(session.getId());
                  throw e;
                }
              }

              public void afterConnectionClosed(WebSocketSession session, CloseStatus status)
                  throws Exception {
                release(session.getId());
                super.afterConnectionClosed(session, status);
              }

              public void handleTransportError(WebSocketSession session, Throwable exception)
                  throws Exception {
                try {
                  session.close(CloseStatus.SERVER_ERROR);
                } finally {
                  release(session.getId());
                  super.handleTransportError(session, exception);
                }
              }
            });
  }

  void release(String id) {
    synchronized (sockets) {
      sockets.remove(id);
    }
  }

  public Realtime(Store s, @Value("${app.origin}") String o) {
    this.s = s;
    origin = o;
  }

  @Bean
  public ThreadPoolTaskScheduler quizBrokerHeartbeatScheduler() {
    var scheduler = new ThreadPoolTaskScheduler();
    scheduler.setPoolSize(1);
    scheduler.setThreadNamePrefix("quiz-heartbeat-");
    scheduler.setRemoveOnCancelPolicy(true);
    return scheduler;
  }

  public void configureMessageBroker(MessageBrokerRegistry r) {
    r.enableSimpleBroker("/topic")
        .setHeartbeatValue(new long[] {10000, 10000})
        .setTaskScheduler(quizBrokerHeartbeatScheduler());
    r.setApplicationDestinationPrefixes("/app");
  }

  public void registerStompEndpoints(StompEndpointRegistry r) {
    r.setPreserveReceiveOrder(true);
    r.addEndpoint("/ws").setAllowedOrigins(origin);
  }

  public void configureClientInboundChannel(ChannelRegistration r) {
    r.interceptors(
        new ChannelInterceptor() {
          public Message<?> preSend(Message<?> msg, MessageChannel channel) {
            var h = MessageHeaderAccessor.getAccessor(msg, StompHeaderAccessor.class);
            if (h == null) return msg;
            try {
              Actor actor = actor(h.getUser());
              var cmd = h.getCommand();
              if (cmd == StompCommand.DISCONNECT)
                return msg; // Transport close releases the socket slot.
              if (cmd != null) {
                synchronized (sockets) {
                  SocketState state = sockets.get(h.getSessionId());
                  Errors.forbidden(state != null);
                  long now = System.currentTimeMillis();
                  if (now - state.window >= 60000) {
                    state.window = now;
                    state.commands = 0;
                  }
                  Errors.forbidden(++state.commands <= 60);
                  if (cmd == StompCommand.UNSUBSCRIBE)
                    state.subscriptions.remove(h.getSubscriptionId());
                }
              }
              if (cmd == StompCommand.CONNECT) {
                Errors.forbidden(
                    actor != null
                        && Objects.equals(actor.csrf(), h.getFirstNativeHeader("X-CSRF-Token")));
              }
              if (cmd == StompCommand.SEND)
                throw new org.springframework.security.access.AccessDeniedException(
                    "Use authenticated REST commands");
              if (cmd == StompCommand.SUBSCRIBE) {
                Errors.forbidden(actor != null);
                String dest = Objects.toString(h.getDestination(), "");
                Errors.forbidden(dest.matches("/topic/rooms/[0-9]{6}"));
                synchronized (sockets) {
                  SocketState state = sockets.get(h.getSessionId());
                  Errors.forbidden(
                      state != null
                          && state.subscriptions.size() < 2
                          && !state.subscriptions.containsKey(h.getSubscriptionId())
                          && !state.subscriptions.containsValue(dest));
                }
                Room room =
                    s.get("rooms", dest.substring(dest.lastIndexOf('/') + 1), Room.class, false);
                Errors.forbidden(
                    actor.role().equals("ADMIN")
                        || room.hostId.equals(actor.id())
                        || (room.members.containsKey(actor.id())
                            && !room.members.get(actor.id()).kicked));
                synchronized (sockets) {
                  SocketState state = sockets.get(h.getSessionId());
                  Errors.forbidden(
                      state != null
                          && h.getSubscriptionId() != null
                          && h.getSubscriptionId().length() <= 100
                          && state.subscriptions.size() < 2
                          && !state.subscriptions.containsKey(h.getSubscriptionId())
                          && !state.subscriptions.containsValue(dest));
                  state.subscriptions.put(h.getSubscriptionId(), dest);
                }
              }
              return msg;
            } catch (RuntimeException failure) {
              SocketState state;
              synchronized (sockets) {
                state = sockets.get(h.getSessionId());
              }
              // Ordered inbound delivery may queue protocol errors. Close denied transports
              // explicitly.
              if (state != null)
                try {
                  state.session.close(CloseStatus.POLICY_VIOLATION);
                } catch (java.io.IOException ignored) {
                }
              throw failure;
            }
          }
        });
  }
}
