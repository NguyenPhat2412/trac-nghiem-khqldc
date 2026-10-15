package vn.vju.quiz;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.util.*;
import org.junit.jupiter.api.Test;
import vn.vju.quiz.Domain.*;

class ReportsTest {
  @Test
  void practiceDoesNotDiluteRoomResponseTime() {
    var store = mock(Store.class);
    var rooms = mock(RoomService.class);
    var question = new Question();
    question.correct = 0;
    var practice = new Attempt();
    practice.name = "Student";
    practice.playerId = "player";
    practice.title = "Practice";
    practice.status = "DONE";
    practice.questions.add(question);
    practice.answers.put(question.id, 0);
    var room = new Room();
    room.status = "FINISHED";
    room.current = 0;
    room.quiz = new Quiz();
    room.quiz.questions.add(question);
    var member = new Member();
    member.answers.put(question.id, 0);
    member.times.put(question.id, 4000L);
    room.members.put(member.id, member);
    when(store.all("attempts", Attempt.class)).thenReturn(List.of(practice));
    when(store.all("rooms", Room.class)).thenReturn(List.of(room));
    when(store.all("chapters", Chapter.class)).thenReturn(List.of());
    when(rooms.ranking(room)).thenReturn(List.of());
    var report =
        new Reports(store, rooms)
            .report(new Actor("admin", "admin", "ADMIN", "csrf"), 0, Long.MAX_VALUE, "", "", "");
    var stats = (Map<?, ?>) ((List<?>) report.get("questions")).getFirst();
    assertEquals(2L, stats.get("count"));
    assertEquals(4000L, stats.get("averageMs"));
  }
}
