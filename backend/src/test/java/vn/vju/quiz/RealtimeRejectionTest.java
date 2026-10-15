package vn.vju.quiz;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.messaging.*;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.stomp.*;
import org.springframework.messaging.support.*;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.web.socket.*;
import vn.vju.quiz.Domain.Actor;

class RealtimeRejectionTest {
  void check(RuntimeException failure, CloseStatus expected) throws Exception {
    Store store = mock(Store.class);
    Realtime realtime = new Realtime(store, "http://localhost:3000");
    var actor = new Actor("student", "Student", "GUEST", "private-csrf");
    var socket = mock(WebSocketSession.class);
    realtime.sockets.put("socket", new Realtime.SocketState(actor.id(), socket));
    var registration = mock(ChannelRegistration.class);
    realtime.configureClientInboundChannel(registration);
    var interceptor = ArgumentCaptor.forClass(ChannelInterceptor.class);
    verify(registration).interceptors(interceptor.capture());
    var headers = StompHeaderAccessor.create(StompCommand.SUBSCRIBE);
    headers.setSessionId("socket");
    headers.setUser(new UsernamePasswordAuthenticationToken(actor, null));
    headers.setSubscriptionId("subscription");
    headers.setDestination("/topic/rooms/123456");
    when(store.liveRoom("123456", false)).thenThrow(failure);
    var message = MessageBuilder.createMessage(new byte[0], headers.getMessageHeaders());
    // No exception carrying the original STOMP message may escape into Spring's frame logger.
    assertNull(interceptor.getValue().preSend(message, mock(MessageChannel.class)));
    verify(socket).close(expected);
  }

  @Test
  void permissionFailureClosesWithoutEchoingFrame() throws Exception {
    check(
        new org.springframework.web.server.ResponseStatusException(
            org.springframework.http.HttpStatus.FORBIDDEN),
        CloseStatus.POLICY_VIOLATION);
  }

  @Test
  void temporaryServerFailureRemainsReconnectable() throws Exception {
    check(new IllegalStateException("database temporarily unavailable"), CloseStatus.SERVER_ERROR);
  }
}
