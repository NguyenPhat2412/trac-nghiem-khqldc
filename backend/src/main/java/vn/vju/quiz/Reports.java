package vn.vju.quiz;

import java.util.*;
import org.springframework.stereotype.Service;
import vn.vju.quiz.Domain.*;

@Service
public class Reports {
  final Store s;
  final RoomService rooms;

  Reports(Store s, RoomService r) {
    this.s = s;
    rooms = r;
  }

  public Map<String, Object> report(
      Actor actor, long from, long to, String chapter, String quiz, String room) {
    Errors.forbidden(actor.staff());
    var rows = new ArrayList<Map<String, Object>>();
    Map<String, long[]> questionStats = new LinkedHashMap<>();
    Map<String, String> texts = new HashMap<>();
    Map<String, Long> chapters = new HashMap<>();
    if (actor.role().equals("ADMIN") && room.isBlank())
      for (Attempt a : s.all("attempts", Attempt.class)) {
        if (!a.status.equals("DONE")
            || a.startedAt < from
            || a.startedAt > to
            || (!quiz.isBlank() && !quiz.equals(a.quizId))
            || (!chapter.isBlank()
                && a.questions.stream().noneMatch(q -> q.chapterId.equals(chapter)))) continue;
        rows.add(
            Map.of(
                "name",
                a.name,
                "playerId",
                a.playerId,
                "title",
                a.title,
                "mode",
                "Tự luyện",
                "score",
                PracticeService.score(a.correct, a.questions.size()),
                "durationMs",
                a.durationMs,
                "date",
                a.finishedAt,
                "roomId",
                "",
                "integrity",
                Integrity.summary(a.integrityEvents)));
        for (Question q : a.questions) {
          acc(questionStats, texts, q, Objects.equals(a.answers.get(q.id), q.correct), -1);
          chapters.merge(q.chapterId, 1L, Long::sum);
        }
      }
    for (Room r : s.all("rooms", Room.class)) {
      if (!r.status.equals("FINISHED")
          || (!actor.role().equals("ADMIN") && !r.hostId.equals(actor.id()))
          || r.createdAt < from
          || r.createdAt > to
          || (!room.isBlank() && !room.equals(r.id))
          || (!quiz.isBlank() && !quiz.equals(r.quiz.id))
          || (!chapter.isBlank()
              && r.quiz.questions.stream().noneMatch(q -> q.chapterId.equals(chapter)))) continue;
      for (var entry : rooms.ranking(r)) {
        var v = new LinkedHashMap<>(entry);
        v.put("title", r.title);
        v.put("mode", "Phòng chơi");
        v.put("date", r.finishedAt);
        v.put("roomId", r.id);
        v.put("integrity", Integrity.summary(r.members.get(entry.get("playerId")).integrityEvents));
        rows.add(v);
      }
      for (Member m : r.members.values())
        if (!m.kicked)
          for (int i = 0; i <= r.current; i++) {
            Question q = r.quiz.questions.get(i);
            acc(
                questionStats,
                texts,
                q,
                Objects.equals(m.answers.get(q.id), q.correct),
                m.times.getOrDefault(q.id, r.quiz.questionSeconds * 1000L));
            chapters.merge(q.chapterId, 1L, Long::sum);
          }
    }
    rows.sort(
        Comparator.comparingLong((Map<String, Object> m) -> ((Number) m.get("date")).longValue())
            .reversed());
    return Map.of(
        "rows",
        rows,
        "total",
        rows.size(),
        "players",
        rows.stream().map(r -> r.get("playerId")).distinct().count(),
        "average",
        rows.stream().mapToDouble(r -> ((Number) r.get("score")).doubleValue()).average().orElse(0),
        "questions",
        questionStats.entrySet().stream()
            .map(
                e ->
                    Map.<String, Object>of(
                        "id",
                        e.getKey(),
                        "text",
                        texts.get(e.getKey()),
                        "count",
                        e.getValue()[0],
                        "wrong",
                        e.getValue()[1],
                        "averageMs",
                        e.getValue()[3] == 0 ? 0 : e.getValue()[2] / e.getValue()[3]))
            .sorted(
                Comparator.comparingLong(
                        (Map<String, Object> m) -> ((Number) m.get("wrong")).longValue())
                    .reversed())
            .toList(),
        "chapters",
        s.all("chapters", Chapter.class).stream()
            .map(c -> Map.of("title", c.title, "count", chapters.getOrDefault(c.id, 0L)))
            .toList());
  }

  void acc(
      Map<String, long[]> stats,
      Map<String, String> texts,
      Question q,
      boolean correct,
      long time) {
    var x = stats.computeIfAbsent(q.id, k -> new long[4]);
    x[0]++;
    if (!correct) x[1]++;
    // Practice permits revisiting questions and has no per-question response clock.
    if (time >= 0) {
      x[2] += time;
      x[3]++;
    }
    texts.put(q.id, q.text);
  }

  public String csv(Map<String, Object> report) {
    StringBuilder b =
        new StringBuilder(
            "\uFEFFTên,Mã người chơi,Bài quiz,Chế độ,Điểm,Thời gian (ms),Mã phòng\r\n");
    for (Object x : (List<?>) report.get("rows")) {
      Map<?, ?> r = (Map<?, ?>) x;
      for (String key :
          List.of("name", "playerId", "title", "mode", "score", "durationMs", "roomId")) {
        String v = Objects.toString(r.get(key), "");
        if (v.matches("^[=+@\\-].*")) v = "'" + v;
        b.append('"')
            .append(v.replace("\"", "\"\""))
            .append('"')
            .append(key.equals("roomId") ? "\r\n" : ",");
      }
    }
    return b.toString();
  }
}
