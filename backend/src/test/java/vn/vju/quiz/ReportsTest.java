package vn.vju.quiz;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.util.*;
import org.junit.jupiter.api.Test;
import vn.vju.quiz.Domain.*;

class ReportsTest {
  @Test
  void csvNeutralizesFormulaPrefixesRegardlessOfLineBreaksOrLeadingControls() {
    var reports = new Reports(mock(Store.class), mock(RoomService.class));
    for (String field : List.of("name", "title"))
      for (String prefix : List.of("=", "+", "-", "@"))
        for (String leading : List.of("", " ", "\t", "\r\n", "\u0000", "\uFEFF"))
          for (String newline : List.of("\n", "\r\n", "\r", "\u0085", "\u2028", "\u2029")) {
            String formula = leading + prefix + "HYPERLINK(\"https://x\",\"a" + newline + "b\")";
            String csv = reports.csv(Map.of("rows", List.of(Map.of(field, formula))));
            assertTrue(csv.contains("\"'" + formula.replace("\"", "\"\"") + "\""),
                "Formula not escaped for " + field + " / " + prefix);
          }
  }

  @Test
  void csvPreservesOrdinaryMultilineVietnameseAndEmptyFields() {
    var reports = new Reports(mock(Store.class), mock(RoomService.class));
    String name = "Nguyễn, \"An\"\nBình";
    String csv = reports.csv(Map.of("rows", List.of(Map.of("name", name, "score", 100))));
    assertTrue(csv.startsWith("\uFEFFTên,"));
    assertTrue(csv.contains("\"Nguyễn, \"\"An\"\"\nBình\",\"\",\"\",\"\",\"100\""));
  }

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
