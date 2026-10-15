package vn.vju.quiz;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import vn.vju.quiz.Domain.*;

class FairPlayTest {
  Question question(String id) {
    var q = new Question();
    q.id = id;
    q.options = List.of("one", "two", "three", "four");
    q.correct = 2;
    q.explanation = "reason";
    return q;
  }

  @Test
  void learningRevealsOnlyAnsweredQuestionAndKeepsFirstChoice() {
    Store s = mock(Store.class);
    var p = new PracticeService(s, new ContentService(s));
    var a = new Attempt();
    a.playerId = "learner";
    a.instantFeedback = true;
    a.questions.addAll(List.of(question("q1"), question("q2")));
    when(s.get("attempts", a.id, Attempt.class, true)).thenReturn(a);
    var actor = new Actor("learner", "Learner", "GUEST", "csrf");
    assertFalse(
        ((Map<?, ?>) ((List<?>) p.view(a).get("questions")).getFirst()).containsKey("correct"));
    p.answer(actor, a.id, new PracticeService.Answer("q1", 0, null));
    var v = p.answer(actor, a.id, new PracticeService.Answer("q1", 2, null));
    assertEquals(0, a.answers.get("q1"));
    var questions = (List<?>) v.get("questions");
    assertEquals(2, ((Map<?, ?>) questions.getFirst()).get("correct"));
    assertFalse(((Map<?, ?>) questions.get(1)).containsKey("correct"));
    p.finish(a, System.currentTimeMillis());
    assertEquals(0, a.correct);
  }

  @Test
  void instantQuizCannotEnterLeaderboard() {
    Store s = mock(Store.class);
    var q = new Quiz();
    q.status = "PUBLISHED";
    q.questions.add(question("q1"));
    when(s.get("quizzes", q.id, Quiz.class, false)).thenReturn(q);
    var p = new PracticeService(s, new ContentService(s));
    var v =
        p.start(
            new Actor("learner", "Learner", "GUEST", "csrf"),
            new PracticeService.Start(q.id, null, 0, 0, null, true));
    assertEquals(false, v.get("ranked"));
    assertEquals(true, v.get("instantFeedback"));
  }

  @Test
  void roomMapsChoicesAndDistributionToEachPlayersOrder() {
    Store s = mock(Store.class);
    var service = new RoomService(s, new ContentService(s), mock(SimpMessagingTemplate.class));
    var r = new Room();
    r.id = "123456";
    r.hostId = "host";
    r.quiz = new Quiz();
    r.title = "Quiz";
    var q = question("q");
    r.quiz.questions.add(q);
    r.current = 0;
    r.status = "QUESTION";
    r.openedAt = System.currentTimeMillis();
    r.deadline = r.openedAt + 30000;
    var m = new Member();
    m.id = "player-1";
    m.name = "Player";
    m.optionOrders.put(q.id, List.of(2, 0, 3, 1));
    r.members.put(m.id, m);
    when(s.get("rooms", r.id, Room.class, true)).thenReturn(r);
    var actor = new Actor(m.id, m.name, "GUEST", "csrf");
    var before = (Map<?, ?>) service.view(actor, r).get("question");
    assertEquals("three", ((List<?>) before.get("options")).getFirst());
    assertFalse(before.containsKey("correct"));
    var after = service.answer(actor, r.id, q.id, 0);
    assertEquals(2, m.answers.get(q.id));
    assertEquals(0, after.get("myAnswer"));
    assertEquals(0, ((Map<?, ?>) after.get("question")).get("correct"));
    assertEquals(List.of(1L, 0L, 0L, 0L), after.get("distribution"));
    assertEquals(100.0, service.ranking(r).getFirst().get("score"));
    assertFalse(after.containsKey("integrity"));
    var host = service.view(new Actor("host", "Host", "EDITOR", "csrf"), r);
    assertTrue(host.containsKey("integrity"));
    assertEquals(List.of(0L, 0L, 1L, 0L), host.get("distribution"));
  }

  @Test
  void legacyRoomWithoutOptionOrderPreservesHistoricalAnswers() {
    Store s = mock(Store.class);
    var service = new RoomService(s, new ContentService(s), mock(SimpMessagingTemplate.class));
    assertEquals(List.of(0, 1, 2, 3), service.order(new Member(), question("legacy")));
  }

  @Test
  void csvExportsFocusSignalsAndKeepsFormulaEscaping() {
    var reports = new Reports(mock(Store.class), mock(RoomService.class));
    var row = new HashMap<String, Object>();
    row.put("name", "=2+2");
    row.put(
        "integrity",
        Map.of("tabHidden", 2L, "copyBlocked", 3L, "fullscreenExit", 1L, "capped", true));
    String csv = reports.csv(Map.of("rows", List.of(row, Map.of("name", "Legacy"))));
    assertTrue(csv.contains("Thoát toàn màn hình"));
    assertTrue(csv.contains("\"'=2+2\""));
    assertTrue(csv.contains(",2,3,1,Có\r\n"));
    assertTrue(csv.endsWith(",0,0,0,Không\r\n"));
  }

  @Test
  void fullscreenSignalsAreOptionalAndDoNotChangeExistingCounters() {
    Map<String, Long> events = new HashMap<>();
    assertEquals(0L, Integrity.summary(events).get("fullscreenExit"));
    var event = new Integrity.Event("exit-1", "FULLSCREEN_EXIT");
    Integrity.record(events, event);
    Integrity.record(events, event);
    assertEquals(1L, Integrity.summary(events).get("fullscreenExit"));
    assertEquals(0L, Integrity.summary(events).get("tabHidden"));
    assertEquals(0L, Integrity.summary(events).get("copyBlocked"));
  }

  @Test
  void integritySignalsAreIdempotentAndBounded() {
    Map<String, Long> events = new HashMap<>();
    var e = new Integrity.Event("same", "TAB_HIDDEN");
    Integrity.record(events, e);
    Integrity.record(events, e);
    assertEquals(1L, Integrity.summary(events).get("tabHidden"));
    for (int i = 0; i < 200; i++)
      Integrity.record(events, new Integrity.Event("copy-" + i, "COPY_BLOCKED"));
    assertEquals(100, events.size());
    assertEquals(true, Integrity.summary(events).get("capped"));
    assertThrows(
        RuntimeException.class,
        () -> Integrity.record(events, new Integrity.Event("bad", "SET_SCORE")));
  }
}
