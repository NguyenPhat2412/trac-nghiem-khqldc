package vn.vju.quiz;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.transaction.support.*;
import vn.vju.quiz.Domain.*;

class RoomPersistenceTest {
  final ObjectMapper json = new ObjectMapper();

  @Test
  void contendedExpiryReadDoesNotWaitOrRevealUncommittedAnswers() {
    var r = room();
    r.status = "QUESTION";
    r.deadline = System.currentTimeMillis() - 1;
    var store = mock(Store.class);
    when(store.liveRoom(r.id, false)).thenReturn(r);
    when(store.tryExpiredRoom(eq(r.id), anyLong())).thenReturn(null);
    var service =
        new RoomService(store, new ContentService(store), mock(SimpMessagingTemplate.class));
    var view = service.get(new Actor("player-1", "Student", "GUEST", "csrf"), r.id);
    assertEquals("QUESTION", view.get("status"));
    assertFalse(((Map<?, ?>) view.get("question")).containsKey("correct"));
    verify(store, never()).liveRoom(r.id, true);
    verify(store, never()).save(anyString(), anyString(), any());
  }

  @Test
  void expiryWinnerClosesOnceAndOutsidersCannotAcquireExpiryLock() {
    var r = room();
    r.status = "QUESTION";
    r.deadline = System.currentTimeMillis() - 1;
    var store = mock(Store.class);
    when(store.liveRoom(r.id, false)).thenReturn(r);
    when(store.tryExpiredRoom(eq(r.id), anyLong())).thenReturn(r);
    var service =
        new RoomService(store, new ContentService(store), mock(SimpMessagingTemplate.class));
    assertThrows(
        org.springframework.web.server.ResponseStatusException.class,
        () -> service.get(new Actor("outsider", "Other", "GUEST", "csrf"), r.id));
    verify(store, never()).tryExpiredRoom(anyString(), anyLong());
    var view = service.get(new Actor("player-1", "Student", "GUEST", "csrf"), r.id);
    assertEquals("REVEAL", view.get("status"));
    assertTrue(((Map<?, ?>) view.get("question")).containsKey("correct"));
    verify(store, times(1)).save("rooms", r.id, r);
  }

  @Test
  void expiryLockQueryIsConditionalAndNonBlocking() {
    var db = mock(JdbcTemplate.class);
    var persistence = new RoomPersistence(db, json);
    assertNull(persistence.tryExpired("123456", 1000));
    verify(db)
        .queryForList(
            contains("for update skip locked"), eq(String.class), eq("123456"), eq(1000L));
  }

  Room room() {
    Room r = new Room();
    r.id = "123456";
    r.hostId = "host";
    r.quiz = new Quiz();
    r.current = 2;
    r.quiz.questionSeconds = 15;
    for (int i = 0; i < 4; i++) {
      Question q = new Question();
      q.id = "q" + i;
      q.correct = i % 4;
      q.options = List.of("A", "B", "C", "D");
      r.quiz.questions.add(q);
    }
    Member m = new Member();
    m.id = "player-1";
    m.name = "Player";
    m.answers.put("q0", 0);
    m.times.put("q0", 120L);
    // q1 is blank; the current q2 is wrong; unopened q3 must not count.
    m.answers.put("q2", 1);
    m.times.put("q2", 230L);
    r.members.put(m.id, m);
    return r;
  }

  @Test
  void compactionAndAdvancementPreserveRankingIncludingBlanks() {
    var r = room();
    var store = mock(Store.class);
    var service =
        new RoomService(store, new ContentService(store), mock(SimpMessagingTemplate.class));
    var before = service.ranking(r);
    RoomPersistence.compactLegacy(r);
    assertEquals(before, service.ranking(r));
    assertEquals(Set.of("q2"), r.members.get("player-1").answers.keySet());
    var persistence = new RoomPersistence(mock(JdbcTemplate.class), json);
    persistence.advance(r);
    r.current++;
    var m = r.members.get("player-1");
    assertTrue(m.answers.isEmpty());
    assertEquals(1, m.completedCorrect);
    assertEquals(15350L, m.completedDurationMs);
    assertEquals(30350L, service.ranking(r).getFirst().get("durationMs"));
  }

  @Test
  void snapshotsPublishOnlyAfterCommitAndNeverAliasMutableSource() throws Exception {
    var db = mock(JdbcTemplate.class);
    var p = new RoomPersistence(db, json);
    var r = room();
    TransactionSynchronizationManager.initSynchronization();
    try {
      p.save(r);
      r.quiz.questions.getFirst().correct = 3;
      var core = json.valueToTree(r);
      ((com.fasterxml.jackson.databind.node.ObjectNode) core).remove("quiz");
      String raw = json.writeValueAsString(core);
      when(db.queryForObject(anyString(), eq(String.class), eq(r.id)))
          .thenThrow(new IllegalStateException("not committed"));
      assertThrows(IllegalStateException.class, () -> p.decode(raw, false));
      TransactionSynchronizationManager.getSynchronizations()
          .forEach(TransactionSynchronization::afterCommit);
      assertEquals(0, p.decode(raw, false).quiz.questions.getFirst().correct);
    } finally {
      TransactionSynchronizationManager.clearSynchronization();
    }
  }

  @Test
  void rolledBackSnapshotNeverEntersCache() throws Exception {
    var db = mock(JdbcTemplate.class);
    var p = new RoomPersistence(db, json);
    var r = room();
    TransactionSynchronizationManager.initSynchronization();
    try {
      p.save(r);
      TransactionSynchronizationManager.getSynchronizations()
          .forEach(x -> x.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK));
    } finally {
      TransactionSynchronizationManager.clearSynchronization();
    }
    var core = json.valueToTree(r);
    ((com.fasterxml.jackson.databind.node.ObjectNode) core).remove("quiz");
    when(db.queryForObject(anyString(), eq(String.class), eq(r.id)))
        .thenThrow(new IllegalStateException("rolled back"));
    assertThrows(IllegalStateException.class, () -> p.decode(json.writeValueAsString(core), false));
  }

  @Test
  void liveViewsHideInternalTotalsAndFinalHistoryIsScopedToActor() {
    var r = room();
    RoomPersistence.compactLegacy(r);
    var store = mock(Store.class);
    var service =
        new RoomService(store, new ContentService(store), mock(SimpMessagingTemplate.class));
    var guest = new Actor("player-1", "Student", "GUEST", "csrf");
    r.status = "QUESTION";
    var v = service.view(guest, r);
    assertFalse(v.toString().contains("completedCorrect"));
    assertFalse(((Map<?, ?>) v.get("question")).containsKey("correct"));
    verify(store, never()).roomHistory(any(), any());
    r.status = "FINISHED";
    service.view(guest, r);
    verify(store).roomHistory(r, "player-1");
    service.view(new Actor("host", "Host", "EDITOR", "csrf"), r);
    verify(store).roomHistory(r, null);
  }

  @Test
  void boundedSnapshotCacheEvictsAndReloadsWithoutChangingQuestions() throws Exception {
    var db = mock(JdbcTemplate.class);
    var persistence = new RoomPersistence(db, json);
    Room oldest = null, newest = null;
    for (int i = 0; i < 129; i++) {
      var r = room();
      r.id = String.valueOf(100000 + i);
      persistence.save(r);
      if (i == 0) oldest = r;
      newest = r;
    }
    var newCore = (com.fasterxml.jackson.databind.node.ObjectNode) json.valueToTree(newest);
    newCore.remove("quiz");
    assertEquals(
        0,
        persistence
            .decode(json.writeValueAsString(newCore), false)
            .quiz
            .questions
            .getFirst()
            .correct);
    verify(db, never()).queryForObject(anyString(), eq(String.class), anyString());
    when(db.queryForObject(anyString(), eq(String.class), eq(oldest.id)))
        .thenReturn(json.writeValueAsString(oldest.quiz));
    var oldCore = (com.fasterxml.jackson.databind.node.ObjectNode) json.valueToTree(oldest);
    oldCore.remove("quiz");
    assertEquals(
        0,
        persistence
            .decode(json.writeValueAsString(oldCore), false)
            .quiz
            .questions
            .getFirst()
            .correct);
    verify(db).queryForObject(anyString(), eq(String.class), eq(oldest.id));
  }
}
