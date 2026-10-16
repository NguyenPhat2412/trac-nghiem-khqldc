package vn.vju.quiz;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.transaction.*;
import org.springframework.transaction.interceptor.TransactionProxyFactoryBean;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.web.server.ResponseStatusException;
import vn.vju.quiz.Domain.*;

class RoomAnswersTest {
  final Store store = mock(Store.class);
  final PlatformTransactionManager tx = mock(PlatformTransactionManager.class);
  final SimpleTransactionStatus status = new SimpleTransactionStatus();
  final Room room = new Room();
  final Actor first = new Actor("player-1", "One", "GUEST", "csrf");
  final Actor second = new Actor("player-2", "Two", "GUEST", "csrf");

  @Test
  void queueBoundsDistinctActorsAndSharesRetries() throws Exception {
    var service = mock(RoomService.class);
    var entered = new CountDownLatch(1);
    var release = new CountDownLatch(1);
    when(service.answerBatch(anyString(), anyList()))
        .thenAnswer(
            invocation -> {
              entered.countDown();
              assertTrue(release.await(3, TimeUnit.SECONDS));
              throw new IllegalStateException("storage unavailable");
            });
    var queue = new RoomAnswers(service);
    try {
      var firstResult = queue.submit(first, "123456", "q", 0);
      assertTrue(entered.await(3, TimeUnit.SECONDS));
      for (int i = 1; i < 100; i++)
        queue.submit(new Actor("guest-" + i, "Student", "GUEST", "csrf"), "123456", "q", 0);
      assertEquals(
          429,
          assertThrows(ResponseStatusException.class, () -> queue.submit(second, "123456", "q", 0))
              .getStatusCode()
              .value());
      // Retrying an existing actor remains allowed without consuming a slot.
      var retry = queue.submit(first, "123456", "q", 3);
      for (int i = 2; i < 32; i++) queue.submit(first, "123456", "q", 0).cancel(false);
      assertEquals(
          429,
          assertThrows(ResponseStatusException.class, () -> queue.submit(first, "123456", "q", 0))
              .getStatusCode()
              .value());
      release.countDown();
      assertThrows(ExecutionException.class, () -> firstResult.get(3, TimeUnit.SECONDS));
      assertThrows(ExecutionException.class, () -> retry.get(3, TimeUnit.SECONDS));
    } finally {
      release.countDown();
      queue.close();
    }
  }

  RoomService service() {
    room.id = "123456";
    room.hostId = "host";
    room.quiz = new Quiz();
    var q = new Question();
    q.id = "question";
    q.options = List.of("a", "b", "c", "d");
    q.correct = 1;
    q.explanation = "secret";
    room.quiz.questions.add(q);
    room.current = 0;
    room.status = "QUESTION";
    room.openedAt = System.currentTimeMillis() - 100;
    room.deadline = System.currentTimeMillis() + 10000;
    for (Actor actor : List.of(first, second)) {
      var member = new Member();
      member.id = actor.id();
      member.name = actor.name();
      room.members.put(actor.id(), member);
    }
    when(store.liveRoom(room.id, true)).thenReturn(room);
    when(tx.getTransaction(any())).thenReturn(status);
    var proxy = new TransactionProxyFactoryBean();
    proxy.setTarget(
        new RoomService(store, new ContentService(store), mock(SimpMessagingTemplate.class)));
    proxy.setTransactionManager(tx);
    var attributes = new Properties();
    attributes.setProperty("*", "PROPAGATION_REQUIRED");
    proxy.setTransactionAttributes(attributes);
    proxy.setProxyTargetClass(true);
    proxy.afterPropertiesSet();
    return (RoomService) proxy.getObject();
  }

  RoomService.AnswerCommand command(Actor actor, String q, int choice) {
    return new RoomService.AnswerCommand(actor, q, choice, System.currentTimeMillis());
  }

  @Test
  void mixedBatchIsolatesUnauthorizedAndInvalidCommandsAndKeepsFirstChoice() {
    var service = service();
    var outsider = new Actor("outsider", "Other", "GUEST", "csrf");
    var result =
        service.answerBatch(
            room.id,
            List.of(
                command(outsider, "question", 1),
                command(first, "future", 1),
                command(first, "question", 0),
                command(first, "question", 1)));
    assertEquals(403, ((ResponseStatusException) result.get(0).failure()).getStatusCode().value());
    assertEquals(400, ((ResponseStatusException) result.get(1).failure()).getStatusCode().value());
    for (int i : List.of(2, 3)) {
      assertEquals(0, result.get(i).value().get("myAnswer"));
      assertFalse(((Map<?, ?>) result.get(i).value().get("question")).containsKey("correct"));
    }
    assertEquals(0, room.members.get(first.id()).answers.get("question"));
    verify(store, times(1)).save("rooms", room.id, room);
  }

  @Test
  void simultaneousLastAnswersCloseOnceAndReturnOnlyEachActorsChoice() {
    var service = service();
    var result =
        service.answerBatch(
            room.id, List.of(command(first, "question", 0), command(second, "question", 1)));
    assertEquals("REVEAL", room.status);
    assertEquals(0, result.get(0).value().get("myAnswer"));
    assertEquals(1, result.get(1).value().get("myAnswer"));
    verify(store, times(1)).save("rooms", room.id, room);
  }

  @Test
  void expiredAndPreopenedAnswersAreRejectedAndConversionRollsBack() {
    var service = service();
    room.deadline = System.currentTimeMillis() - 1;
    var result = service.answerBatch(room.id, List.of(command(first, "question", 0)));
    assertNotNull(result.getFirst().failure());
    assertTrue(status.isRollbackOnly());
    assertTrue(room.members.get(first.id()).answers.isEmpty());
    room.deadline = System.currentTimeMillis() + 10000;
    result =
        service.answerBatch(
            room.id,
            List.of(new RoomService.AnswerCommand(first, "question", 0, room.openedAt - 1)));
    assertNotNull(result.getFirst().failure());
    verify(store, never()).save(anyString(), anyString(), any());
  }

  @Test
  void responseWaitsForCommitAndCancelledRetryCannotCancelFirstAnswer() throws Exception {
    var service = service();
    var inCommit = new CountDownLatch(1);
    var release = new CountDownLatch(1);
    doAnswer(
            invocation -> {
              inCommit.countDown();
              assertTrue(release.await(3, TimeUnit.SECONDS));
              return null;
            })
        .when(tx)
        .commit(any());
    var queue = new RoomAnswers(service);
    try {
      var response = queue.submit(first, room.id, "question", 0);
      assertTrue(inCommit.await(3, TimeUnit.SECONDS));
      assertFalse(response.isDone());
      var retry = queue.submit(first, room.id, "question", 1);
      retry.cancel(false);
      assertFalse(response.isDone());
      release.countDown();
      assertEquals(0, response.get(3, TimeUnit.SECONDS).get("myAnswer"));
    } finally {
      release.countDown();
      queue.close();
    }
  }

  @Test
  void failedCommitNeverAcknowledgesAndShutDownRejectsNewWork() throws Exception {
    var service = service();
    doThrow(new TransactionSystemException("disk failure")).when(tx).commit(any());
    var queue = new RoomAnswers(service);
    try {
      var response = queue.submit(first, room.id, "question", 0);
      var failure = assertThrows(ExecutionException.class, () -> response.get(3, TimeUnit.SECONDS));
      assertInstanceOf(TransactionSystemException.class, failure.getCause());
    } finally {
      queue.close();
    }
    assertThrows(ResponseStatusException.class, () -> queue.submit(second, room.id, "question", 0));
  }
}
