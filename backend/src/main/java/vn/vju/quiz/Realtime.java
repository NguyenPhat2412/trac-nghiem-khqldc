package vn.vju.quiz;

import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.*;
import org.springframework.messaging.simp.config.*;
import org.springframework.messaging.simp.stomp.*;
import org.springframework.messaging.support.*;
import org.springframework.security.core.Authentication;
import org.springframework.web.socket.config.annotation.*;
import vn.vju.quiz.Domain.*;

@Configuration
@EnableWebSocketMessageBroker
public class Realtime implements WebSocketMessageBrokerConfigurer {
  final Store s;
  final String origin;

  public Realtime(Store s, @Value("${app.origin}") String o) {
    this.s = s;
    origin = o;
  }

  public void configureMessageBroker(MessageBrokerRegistry r) {
    r.enableSimpleBroker("/topic");
    r.setApplicationDestinationPrefixes("/app");
  }

  public void registerStompEndpoints(StompEndpointRegistry r) {
    r.addEndpoint("/ws").setAllowedOrigins(origin);
  }

  public void configureClientInboundChannel(ChannelRegistration r) {
    r.interceptors(
        new ChannelInterceptor() {
          public Message<?> preSend(Message<?> msg, MessageChannel channel) {
            var h = MessageHeaderAccessor.getAccessor(msg, StompHeaderAccessor.class);
            if (h == null) return msg;
            Actor actor =
                h.getUser() instanceof Authentication a && a.getPrincipal() instanceof Actor p
                    ? p
                    : null;
            var cmd = h.getCommand();
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
              Room room =
                  s.get("rooms", dest.substring(dest.lastIndexOf('/') + 1), Room.class, false);
              Errors.forbidden(
                  actor.role().equals("ADMIN")
                      || room.hostId.equals(actor.id())
                      || (room.members.containsKey(actor.id())
                          && !room.members.get(actor.id()).kicked));
            }
            return msg;
          }
        });
  }
}
