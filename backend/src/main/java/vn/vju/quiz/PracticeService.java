package vn.vju.quiz;

import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import vn.vju.quiz.Domain.*;

@Service
public class PracticeService {
  final Store s;
  final ContentService content;

  public PracticeService(Store s, ContentService c) {
    this.s = s;
    content = c;
  }

  public record Start(
      String quizId,
      List<String> chapterIds,
      int count,
      int timeLimitSeconds,
      String retryId,
      Boolean instantFeedback) {}

  @Transactional
  public Map<String, Object> start(Actor p, Start input) {
    s.guardActiveAttempts(p.id());
    Attempt a = new Attempt();
    a.playerId = p.id();
    a.name = p.name();
    int seconds = 0;
    if (input.retryId() != null && !input.retryId().isBlank()) {
      Attempt old = owned(p, input.retryId(), false);
      Errors.require(old.status.equals("DONE"), "Bài chưa hoàn thành");
      a.questions =
          new ArrayList<>(
              old.questions.stream()
                  .filter(q -> !Objects.equals(old.answers.get(q.id), q.correct))
                  .toList());
      a.title = "Luyện lại câu sai · " + old.title;
      a.instantFeedback = true;
    } else if (input.quizId() != null && !input.quizId().isBlank()) {
      Quiz q = s.get("quizzes", input.quizId(), Quiz.class, false);
      Errors.require(q.status.equals("PUBLISHED"), "Bộ quiz không còn mở");
      a.quizId = q.id;
      a.title = q.title;
      a.questions = new ArrayList<>(q.questions);
      seconds = q.timeLimitSeconds;
      a.instantFeedback = Boolean.TRUE.equals(input.instantFeedback());
      a.ranked = !a.instantFeedback;
      if (q.shuffle) shuffle(a.questions);
    } else {
      Errors.require(
          input.count() > 0
              && input.count() <= 100
              && input.timeLimitSeconds() >= 0
              && input.timeLimitSeconds() <= 7200,
          "Cấu hình bài chưa hợp lệ");
      var published =
          s.all("chapters", Chapter.class).stream()
              .filter(c -> c.status.equals("PUBLISHED"))
              .map(c -> c.id)
              .toList();
      var pool =
          new ArrayList<>(
              s.all("questions", Question.class).stream()
                  .filter(
                      q ->
                          q.status.equals("PUBLISHED")
                              && published.contains(q.chapterId)
                              && input.chapterIds() != null
                              && input.chapterIds().contains(q.chapterId))
                  .toList());
      Errors.require(pool.size() >= input.count(), "Không đủ câu hỏi cho lựa chọn này");
      Collections.shuffle(pool);
      a.questions = new ArrayList<>(pool.subList(0, input.count()));
      a.title = "Bài luyện theo chương";
      a.instantFeedback = !Boolean.FALSE.equals(input.instantFeedback());
      seconds = input.timeLimitSeconds();
      shuffle(a.questions);
    }
    Errors.require(!a.questions.isEmpty(), "Không có câu sai cần luyện lại");
    a.startedAt = System.currentTimeMillis();
    a.deadline = seconds == 0 ? 0 : a.startedAt + seconds * 1000L;
    s.save("attempts", a.id, a);
    return view(a);
  }

  void shuffle(List<Question> qs) {
    Collections.shuffle(qs);
    for (Question q : qs) {
      String correct = q.options.get(q.correct);
      List<Integer> order = new ArrayList<>(List.of(0, 1, 2, 3));
      Collections.shuffle(order);
      List<String> opts = order.stream().map(q.options::get).toList();
      q.correct = order.indexOf(q.correct);
      q.options = opts;
    }
  }

  Attempt owned(Actor p, String id, boolean lock) {
    Attempt a = s.get("attempts", id, Attempt.class, lock);
    Errors.forbidden(a.playerId.equals(p.id()));
    return a;
  }

  public void finish(Attempt a, long now) {
    if (!a.status.equals("ACTIVE")) return;
    a.status = "DONE";
    a.finishedAt = a.deadline > 0 ? Math.min(now, a.deadline) : now;
    a.durationMs = Math.max(0, a.finishedAt - a.startedAt);
    a.correct =
        (int)
            a.questions.stream()
                .filter(q -> Objects.equals(a.answers.get(q.id), q.correct))
                .count();
    s.save("attempts", a.id, a);
  }

  @Transactional
  public Map<String, Object> get(Actor p, String id) {
    Attempt a = owned(p, id, true);
    if (a.deadline > 0 && a.deadline <= System.currentTimeMillis()) finish(a, a.deadline);
    return view(a);
  }

  public record Answer(String questionId, Integer answer, Boolean flagged) {}

  @Transactional
  public Map<String, Object> answer(Actor p, String id, Answer in) {
    Attempt a = owned(p, id, true);
    long now = System.currentTimeMillis();
    if (a.deadline > 0 && now >= a.deadline) finish(a, a.deadline);
    Errors.require(a.status.equals("ACTIVE"), "Bài đã kết thúc");
    Errors.require(
        a.questions.stream().anyMatch(q -> q.id.equals(in.questionId())),
        "Câu hỏi không thuộc bài này");
    if (in.answer() != null) {
      Errors.require(in.answer() >= 0 && in.answer() < 4, "Đáp án không hợp lệ");
      if (!a.instantFeedback || !a.answers.containsKey(in.questionId()))
        a.answers.put(in.questionId(), in.answer());
    }
    if (in.flagged() != null) {
      if (in.flagged()) a.flagged.add(in.questionId());
      else a.flagged.remove(in.questionId());
    }
    s.save("attempts", id, a);
    return view(a);
  }

  @Transactional
  public Map<String, Object> submit(Actor p, String id) {
    Attempt a = owned(p, id, true);
    finish(a, System.currentTimeMillis());
    return view(a);
  }

  public Map<String, Object> view(Attempt a) {
    Map<String, Object> v = new LinkedHashMap<>();
    v.put("id", a.id);
    v.put("title", a.title);
    v.put("quizId", a.quizId);
    v.put("status", a.status);
    v.put("startedAt", a.startedAt);
    v.put("deadline", a.deadline);
    v.put("serverTime", System.currentTimeMillis());
    v.put("answers", a.answers);
    v.put("flagged", a.flagged);
    v.put("instantFeedback", a.instantFeedback);
    v.put(
        "questions",
        a.questions.stream()
            .map(
                q ->
                    content.question(
                        q,
                        a.status.equals("DONE")
                            || (a.instantFeedback && a.answers.containsKey(q.id))))
            .toList());
    v.put("durationMs", a.durationMs);
    v.put("correct", a.correct);
    v.put("score", score(a.correct, a.questions.size()));
    v.put("ranked", a.ranked);
    return v;
  }

  @Transactional
  public void integrity(Actor p, String id, Integrity.Event event) {
    Attempt a = owned(p, id, true);
    Errors.require(
        a.status.equals("ACTIVE") && (a.deadline == 0 || System.currentTimeMillis() < a.deadline),
        "Bài đã kết thúc");
    Integrity.record(a.integrityEvents, event);
    s.save("attempts", id, a);
  }

  public static double score(int correct, int count) {
    return count == 0 ? 0 : Math.round(correct * 10000.0 / count) / 100.0;
  }

  public List<Map<String, Object>> history(Actor p) {
    return s.by("attempts", "playerId", p.id(), Attempt.class).stream()
        .sorted(Comparator.comparingLong((Attempt a) -> a.startedAt).reversed())
        .map(
            a ->
                Map.<String, Object>of(
                    "id",
                    a.id,
                    "title",
                    a.title,
                    "status",
                    a.status,
                    "score",
                    score(a.correct, a.questions.size()),
                    "startedAt",
                    a.startedAt,
                    "durationMs",
                    a.durationMs,
                    "correct",
                    a.correct,
                    "count",
                    a.questions.size()))
        .toList();
  }

  public List<Map<String, Object>> leaderboard(String quizId) {
    s.get("quizzes", quizId, Quiz.class, false);
    var all =
        s.by("attempts", "quizId", quizId, Attempt.class).stream()
            .filter(a -> a.ranked && a.status.equals("DONE"))
            .toList();
    Comparator<Attempt> cmp =
        Comparator.comparingInt((Attempt a) -> a.correct)
            .reversed()
            .thenComparingLong(a -> a.durationMs);
    Map<String, Attempt> best = new HashMap<>();
    for (Attempt a : all) best.merge(a.playerId, a, (x, y) -> cmp.compare(x, y) <= 0 ? x : y);
    var sorted = best.values().stream().sorted(cmp.thenComparing(a -> a.playerId)).toList();
    List<Map<String, Object>> rows = new ArrayList<>();
    int rank = 0;
    Attempt prev = null;
    for (int i = 0; i < sorted.size(); i++) {
      Attempt a = sorted.get(i);
      if (prev == null || cmp.compare(prev, a) != 0) rank = i + 1;
      rows.add(
          Map.of(
              "rank",
              rank,
              "playerId",
              a.playerId,
              "name",
              a.name,
              "shortId",
              a.playerId.substring(0, 6),
              "correct",
              a.correct,
              "score",
              score(a.correct, a.questions.size()),
              "durationMs",
              a.durationMs,
              "attempts",
              all.stream().filter(x -> x.playerId.equals(a.playerId)).count()));
      prev = a;
    }
    return rows;
  }
}
