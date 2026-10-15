package vn.vju.quiz;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import org.junit.jupiter.api.Test;
import vn.vju.quiz.Domain.*;

class ScoringTest {
  @Test
  void scoreRoundsAndHandlesEmpty() {
    assertEquals(33.33, PracticeService.score(1, 3));
    assertEquals(100, PracticeService.score(4, 4));
    assertEquals(0, PracticeService.score(0, 0));
  }

  @Test
  void tieRankingAndTimeoutPenalty() {
    var service =
        new RoomService(
            mock(Store.class),
            mock(ContentService.class),
            mock(org.springframework.messaging.simp.SimpMessagingTemplate.class));
    Room room = new Room();
    room.quiz = new Quiz();
    room.quiz.questionSeconds = 30;
    Question q = new Question();
    q.correct = 2;
    room.quiz.questions.add(q);
    room.current = 0;
    for (String id : java.util.List.of("aaaaaa", "bbbbbb", "cccccc")) {
      Member m = new Member();
      m.id = id;
      m.name = "Same";
      if (!id.equals("cccccc")) {
        m.answers.put(q.id, 2);
        m.times.put(q.id, 1000L);
      }
      room.members.put(id, m);
    }
    var rows = service.ranking(room);
    assertEquals(1, rows.get(0).get("rank"));
    assertEquals(1, rows.get(1).get("rank"));
    assertEquals(3, rows.get(2).get("rank"));
    assertEquals(30000L, rows.get(2).get("durationMs"));
  }

  @Test
  void privateQuestionNeverContainsKey() {
    Question q = new Question();
    q.correct = 3;
    q.explanation = "secret";
    var service = new ContentService(mock(Store.class));
    assertFalse(service.question(q, false).containsKey("correct"));
    assertFalse(service.question(q, false).containsKey("explanation"));
    assertEquals(3, service.question(q, true).get("correct"));
  }
}
