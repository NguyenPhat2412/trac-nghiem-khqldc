package vn.vju.quiz;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import vn.vju.quiz.Domain.*;

class ExamRoomTest {
  Question question(String id, int correct) {
    var q = new Question();
    q.id = id;
    q.text = "Question " + id;
    q.options = List.of("Opt A", "Opt B", "Opt C", "Opt D");
    q.correct = correct;
    q.explanation = "Explanation for " + id;
    return q;
  }

  Quiz publishedQuiz() {
    var q = new Quiz();
    q.id = "quiz-1";
    q.title = "Chương 5 · 25 câu";
    q.status = "PUBLISHED";
    q.shuffle = true;
    q.timeLimitSeconds = 900;
    q.questionSeconds = 30;
    q.questions.addAll(List.of(question("q1", 1), question("q2", 3), question("q3", 0)));
    return q;
  }

  @Test
  void examRoomWaitsInLobbyUntilHostStartsThenStartsCountdown() {
    Quiz quiz = publishedQuiz();
    var db = mock(org.springframework.jdbc.core.JdbcTemplate.class);
    var realStore = new Store(db, new com.fasterxml.jackson.databind.ObjectMapper());
    Store spyStore = spy(realStore);
    doReturn(quiz).when(spyStore).get("quizzes", quiz.id, Quiz.class, false);
    when(db.queryForObject(contains("exists(select 1 from rooms"), eq(Boolean.class), anyString()))
        .thenReturn(false);

    var service =
        new RoomService(spyStore, new ContentService(spyStore), mock(SimpMessagingTemplate.class));
    var host = new Actor("admin-1", "Admin", "ADMIN", "csrf");

    Map<String, Object> created = service.create(host, quiz.id, false, false, null, "EXAM", 15);
    assertEquals("EXAM", created.get("mode"));
    assertEquals("LOBBY", created.get("status"));
    assertEquals(15 * 60, created.get("durationSeconds"));
    assertEquals(0L, created.get("openedAt"));
    assertEquals(0L, created.get("deadline"));
    assertEquals(List.of(), created.get("ranking"));
  }

  @Test
  void examLobbyToOpenLifecycleMeasuresTimeFromHostStartAndRevealsOnlyAfterExpiry() {
    Store store = mock(Store.class);
    var service = new RoomService(store, new ContentService(store), mock(SimpMessagingTemplate.class));

    Room r = new Room();
    r.id = "654321";
    r.hostId = "admin-1";
    r.title = "Đề Chương 5";
    r.mode = "EXAM";
    r.status = "LOBBY";
    r.durationSeconds = 600;
    r.shuffleAnswers = true;
    r.quiz = publishedQuiz();

    Actor host = new Actor("admin-1", "Admin", "ADMIN", "csrf");
    Actor studentA = new Actor("student-a", "Lan Anh", "GUEST", "csrf");
    Actor studentB = new Actor("student-b", "Minh Tuấn", "GUEST", "csrf");

    when(store.liveRoom(r.id, true)).thenReturn(r);
    when(store.liveRoom(r.id, false)).thenReturn(r);

    Map<String, RoomPersistence.ExamProgress> memProgress = new HashMap<>();
    doAnswer(
            inv -> {
              String pid = inv.getArgument(1);
              return memProgress.computeIfAbsent(pid, k -> new RoomPersistence.ExamProgress());
            })
        .when(store)
        .examProgress(eq(r.id), anyString(), anyBoolean());
    doAnswer(
            inv -> {
              String pid = inv.getArgument(1);
              RoomPersistence.ExamProgress p = inv.getArgument(2);
              memProgress.put(pid, p);
              return null;
            })
        .when(store)
        .saveExamProgress(eq(r.id), anyString(), any());
    doAnswer(
            inv -> {
              Room roomArg = inv.getArgument(0);
              String onlyPlayer = inv.getArgument(1);
              for (Member m : roomArg.members.values()) {
                if (onlyPlayer == null || onlyPlayer.equals(m.id)) {
                  var p = memProgress.get(m.id);
                  if (p != null) m.answers.putAll(p.answers);
                }
              }
              return null;
            })
        .when(store)
        .roomHistory(eq(r), any());

    // Students join while waiting in LOBBY: questions and countdown are NOT started yet
    var lobbyA = service.join(studentA, r.id);
    var lobbyB = service.join(studentB, r.id);
    assertEquals("LOBBY", lobbyA.get("status"));
    assertEquals("LOBBY", lobbyB.get("status"));
    assertFalse(lobbyA.containsKey("examQuestions"));
    assertEquals(0L, lobbyA.get("deadline"));

    // Simulate Student A having waited 5 minutes in LOBBY before host starts
    r.members.get(studentA.id()).joinedAt = System.currentTimeMillis() - 300_000L;

    // Cannot answer before host opens the room
    assertThrows(
        RuntimeException.class,
        () -> service.examAnswer(studentA, r.id, new PracticeService.Answer("q1", 0, null)));

    // Host sees everyone ready and starts the exam room
    var startedHostView = service.action(host, r.id, "start", null);
    assertEquals("OPEN", startedHostView.get("status"));
    assertEquals(600_000L, (Long) startedHostView.get("deadline") - (Long) startedHostView.get("openedAt"));

    var joinedA = service.view(studentA, r);
    var joinedB = service.view(studentB, r);
    assertEquals("OPEN", joinedA.get("status"));
    assertEquals(3, ((List<?>) joinedA.get("examQuestions")).size());

    // Neither correct answers, explanations, nor rankings are exposed while OPEN
    for (Object qObj : (List<?>) joinedA.get("examQuestions")) {
      Map<?, ?> qMap = (Map<?, ?>) qObj;
      assertFalse(qMap.containsKey("correct"));
      assertFalse(qMap.containsKey("explanation"));
    }
    assertEquals(List.of(), joinedA.get("ranking"));

    // Student A answers all 3 questions correctly (mapped through A's shuffled options) and changes q1 once
    @SuppressWarnings("unchecked")
    var qListA = (List<Map<String, Object>>) joinedA.get("examQuestions");
    Map<String, String> canonicalCorrectText =
        Map.of("q1", "Opt B", "q2", "Opt D", "q3", "Opt A");

    String firstQId = (String) qListA.getFirst().get("id");
    service.examAnswer(studentA, r.id, new PracticeService.Answer(firstQId, 0, true));
    for (var qView : qListA) {
      String qid = (String) qView.get("id");
      @SuppressWarnings("unchecked")
      List<String> opts = (List<String>) qView.get("options");
      int rightChoice = opts.indexOf(canonicalCorrectText.get(qid));
      service.examAnswer(studentA, r.id, new PracticeService.Answer(qid, rightChoice, false));
    }

    // Student B answers only 1 question correctly and does NOT click submit before timeout
    @SuppressWarnings("unchecked")
    var qListB = (List<Map<String, Object>>) joinedB.get("examQuestions");
    String bQid = (String) qListB.getFirst().get("id");
    @SuppressWarnings("unchecked")
    List<String> bOpts = (List<String>) qListB.getFirst().get("options");
    int bRight = bOpts.indexOf(canonicalCorrectText.get(bQid));
    service.examAnswer(studentB, r.id, new PracticeService.Answer(bQid, bRight, null));

    // Student A submits early: still MUST NOT see keys, explanations, or ranking while room is OPEN
    var afterSubmitA = service.submitExam(studentA, r.id);
    assertEquals(true, afterSubmitA.get("mySubmitted"));
    assertEquals(List.of(), afterSubmitA.get("ranking"));
    assertFalse(afterSubmitA.containsKey("details"));
    for (Object qObj : (List<?>) afterSubmitA.get("examQuestions")) {
      assertFalse(((Map<?, ?>) qObj).containsKey("correct"));
    }

    // Student A cannot change answers after submitting
    assertThrows(
        RuntimeException.class,
        () -> service.examAnswer(studentA, r.id, new PracticeService.Answer(firstQId, 0, null)));

    // Now the room timer expires automatically without host intervention!
    r.deadline = System.currentTimeMillis() - 1;
    service.tick(r.id);
    assertEquals("FINISHED", r.status);

    var finalA = service.view(studentA, r);
    assertEquals("FINISHED", finalA.get("status"));
    @SuppressWarnings("unchecked")
    var ranking = (List<Map<String, Object>>) finalA.get("ranking");
    assertEquals(2, ranking.size());
    assertEquals("student-a", ranking.get(0).get("playerId"));
    assertEquals(3, ranking.get(0).get("correct"));
    assertEquals(100.0, ranking.get(0).get("score"));
    // Lobby wait time (5 minutes before start) must NOT be counted against Student A's durationMs
    assertTrue((Long) ranking.get(0).get("durationMs") < 60_000L);
    assertEquals("student-b", ranking.get(1).get("playerId"));
    assertEquals(1, ranking.get(1).get("correct"));
    assertEquals(33.33, ranking.get(1).get("score"));

    // Full explanations and correct answers are now returned to the student
    @SuppressWarnings("unchecked")
    var details = (List<Map<String, Object>>) finalA.get("details");
    assertEquals(1, details.size());
    @SuppressWarnings("unchecked")
    var reviewedQuestions = (List<Map<String, Object>>) details.getFirst().get("questions");
    assertEquals(3, reviewedQuestions.size());
    for (var item : reviewedQuestions) {
      @SuppressWarnings("unchecked")
      var rq = (Map<String, Object>) item.get("question");
      assertTrue(rq.containsKey("correct"));
      assertTrue(rq.get("explanation").toString().startsWith("Explanation for "));
    }
  }

  @Test
  void liveRevealNeverExposesRankingBeforeRoomFinishes() {
    Store store = mock(Store.class);
    var service = new RoomService(store, new ContentService(store), mock(SimpMessagingTemplate.class));
    Room r = new Room();
    r.id = "111222";
    r.hostId = "host";
    r.quiz = publishedQuiz();
    r.current = 0;
    r.status = "REVEAL";
    Member m = new Member();
    m.id = "player-1";
    m.name = "Hùng";
    m.answers.put("q1", 1);
    r.members.put(m.id, m);

    var revealView = service.view(new Actor(m.id, m.name, "GUEST", "csrf"), r);
    assertEquals(List.of(), revealView.get("ranking"));

    r.status = "FINISHED";
    var finishedView = service.view(new Actor(m.id, m.name, "GUEST", "csrf"), r);
    assertEquals(1, ((List<?>) finishedView.get("ranking")).size());
  }
}
