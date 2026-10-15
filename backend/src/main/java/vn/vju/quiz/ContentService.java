package vn.vju.quiz;

import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import vn.vju.quiz.Domain.*;

@Service
public class ContentService {
  final Store s;
  private Map<String, Object> cachedCatalog;
  private long cachedRevision = -1, catalogExpiresAt;

  // Only immutable public summaries are cached. Never cache mutable questions or player views.
  public synchronized Map<String, Object> catalog() {
    long now = System.nanoTime(), revision = s.contentRevision();
    if (cachedCatalog == null || revision != cachedRevision || now >= catalogExpiresAt) {
      cachedCatalog = buildCatalog();
      cachedRevision = revision;
      catalogExpiresAt = now + java.util.concurrent.TimeUnit.SECONDS.toNanos(15);
    }
    return cachedCatalog;
  }

  public ContentService(Store s) {
    this.s = s;
  }

  public void validate(Question q) {
    q.text = Errors.text(q.text, 4000);
    Errors.require(q.options != null && q.options.size() == 4, "Cần đúng bốn đáp án");
    q.options = q.options.stream().map(v -> Errors.text(v, 1000)).toList();
    Errors.require(q.correct >= 0 && q.correct < 4, "Đáp án đúng phải là A, B, C hoặc D");
    Errors.require(Set.of("EASY", "MEDIUM", "HARD").contains(q.difficulty), "Độ khó không hợp lệ");
    Errors.require(
        Set.of("DRAFT", "PUBLISHED", "ARCHIVED").contains(q.status), "Trạng thái không hợp lệ");
    Errors.require(q.explanation != null && q.explanation.length() <= 5000, "Lời giải quá dài");
    Errors.require(
        q.imageUrl != null && (q.imageUrl.isBlank() || q.imageUrl.matches("https://[^\\s]+")),
        "Ảnh cần là liên kết HTTPS");
    s.get("chapters", q.chapterId, Chapter.class, false);
  }

  Map<String, Object> buildCatalog() {
    var chapters =
        s.all("chapters", Chapter.class).stream()
            .filter(c -> c.status.equals("PUBLISHED"))
            .sorted(Comparator.comparingInt(c -> c.position))
            .toList();
    var ids = chapters.stream().map(c -> c.id).toList();
    var qs =
        s.all("questions", Question.class).stream()
            .filter(q -> q.status.equals("PUBLISHED") && ids.contains(q.chapterId))
            .toList();
    return Map.of(
        "chapters",
        chapters.stream()
            .map(
                c ->
                    Map.of(
                        "id",
                        c.id,
                        "title",
                        c.title,
                        "description",
                        c.description,
                        "position",
                        c.position,
                        "count",
                        qs.stream().filter(q -> q.chapterId.equals(c.id)).count()))
            .toList(),
        "quizzes",
        s.all("quizzes", Quiz.class).stream()
            .filter(q -> q.status.equals("PUBLISHED"))
            .sorted(Comparator.comparingLong((Quiz q) -> q.createdAt).reversed())
            .map(this::summary)
            .toList());
  }

  public Map<String, Object> summary(Quiz q) {
    return Map.of(
        "id",
        q.id,
        "title",
        q.title,
        "description",
        q.description,
        "version",
        q.version,
        "count",
        q.questions.size(),
        "timeLimitSeconds",
        q.timeLimitSeconds,
        "questionSeconds",
        q.questionSeconds,
        "status",
        q.status,
        "chapterIds",
        q.questions.stream().map(x -> x.chapterId).distinct().toList());
  }

  public Map<String, Object> question(Question q, boolean reveal) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("id", q.id);
    m.put("chapterId", q.chapterId);
    m.put("text", q.text);
    m.put("imageUrl", q.imageUrl);
    m.put("options", q.options);
    if (reveal) {
      m.put("correct", q.correct);
      m.put("explanation", q.explanation);
    }
    return m;
  }

  @Transactional
  public Chapter chapter(Chapter c, String id) {
    if (id != null) {
      s.get("chapters", id, Chapter.class, true);
      c.id = id;
    } else c.id = UUID.randomUUID().toString();
    c.title = Errors.text(c.title, 200);
    Errors.require(c.description != null && c.description.length() <= 2000, "Mô tả quá dài");
    Errors.require(
        Set.of("DRAFT", "PUBLISHED", "ARCHIVED").contains(c.status), "Trạng thái không hợp lệ");
    s.save("chapters", c.id, c);
    return c;
  }

  @Transactional
  public Question questionSave(Question q, String id) {
    if (id != null) {
      s.get("questions", id, Question.class, true);
      q.id = id;
    } else q.id = UUID.randomUUID().toString();
    validate(q);
    s.save("questions", q.id, q);
    return q;
  }

  public record QuizInput(
      String title,
      String description,
      String status,
      List<String> questionIds,
      List<String> chapterIds,
      int count,
      int timeLimitSeconds,
      int questionSeconds,
      boolean shuffle) {}

  @Transactional
  public Quiz quiz(QuizInput in, String id) {
    Quiz q = new Quiz();
    if (id != null) {
      Quiz old = s.get("quizzes", id, Quiz.class, true);
      q.familyId = old.familyId;
      int latest =
          s.db.queryForObject(
              "select max((data->>'version')::int) from quizzes where data->>'familyId'=?",
              Integer.class,
              old.familyId);
      Errors.require(old.version == latest, "Bộ quiz đã có phiên bản mới. Hãy sửa bản mới nhất.");
      q.version = latest + 1;
      if (old.status.equals("DRAFT")) {
        q.id = old.id;
        q.version = old.version;
      }
      if ("PUBLISHED".equals(in.status()) || "ARCHIVED".equals(in.status())) {
        s.db.update(
            "update quizzes set data=jsonb_set(data,'{status}','\"ARCHIVED\"'::jsonb) where"
                + " data->>'familyId'=? and data->>'status'='PUBLISHED'",
            old.familyId);
      }
    }
    q.title = Errors.text(in.title(), 200);
    q.description = Objects.toString(in.description(), "");
    Errors.require(q.description.length() <= 2000, "Mô tả quá dài");
    q.status = in.status();
    Errors.require(
        Set.of("DRAFT", "PUBLISHED", "ARCHIVED").contains(q.status), "Trạng thái không hợp lệ");
    Errors.require(
        in.timeLimitSeconds() >= 0
            && in.timeLimitSeconds() <= 7200
            && in.questionSeconds() >= 5
            && in.questionSeconds() <= 300,
        "Thời gian không hợp lệ");
    q.timeLimitSeconds = in.timeLimitSeconds();
    q.questionSeconds = in.questionSeconds();
    q.shuffle = in.shuffle();
    if (in.questionIds() != null && !in.questionIds().isEmpty()) {
      Errors.require(
          new HashSet<>(in.questionIds()).size() == in.questionIds().size(), "Câu hỏi bị lặp");
      q.questions =
          in.questionIds().stream().map(x -> s.get("questions", x, Question.class, false)).toList();
    } else {
      var pool =
          new ArrayList<>(
              s.all("questions", Question.class).stream()
                  .filter(
                      x ->
                          x.status.equals("PUBLISHED")
                              && in.chapterIds() != null
                              && in.chapterIds().contains(x.chapterId))
                  .toList());
      Collections.shuffle(pool);
      Errors.require(in.count() > 0 && in.count() <= pool.size(), "Không đủ câu hỏi đã xuất bản");
      q.questions = pool.subList(0, in.count());
    }
    Errors.require(
        !q.questions.isEmpty() && q.questions.size() <= 100, "Bộ quiz cần từ 1 đến 100 câu");
    Errors.require(
        q.questions.stream().allMatch(x -> x.status.equals("PUBLISHED")),
        "Chỉ chọn câu hỏi đã xuất bản");
    s.save("quizzes", q.id, q);
    return q;
  }
}
