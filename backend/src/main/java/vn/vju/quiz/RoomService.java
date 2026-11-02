package vn.vju.quiz;

import java.util.*;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.*;
import vn.vju.quiz.Domain.*;

@Service
public class RoomService {
  final Store s;
  final ContentService content;
  final SimpMessagingTemplate events;
  final java.security.SecureRandom random = new java.security.SecureRandom();

  public RoomService(Store s, ContentService c, SimpMessagingTemplate e) {
    this.s = s;
    content = c;
    events = e;
  }

  void save(Room r) {
    r.version++;
    s.save("rooms", r.id, r);
    var event =
        Map.of("roomId", r.id, "version", r.version, "serverTime", System.currentTimeMillis());
    if (TransactionSynchronizationManager.isSynchronizationActive())
      TransactionSynchronizationManager.registerSynchronization(
          new TransactionSynchronization() {
            public void afterCommit() {
              events.convertAndSend("/topic/rooms/" + r.id, event);
            }
          });
  }

  public boolean access(Actor a, Room r) {
    return a != null
        && (a.role().equals("ADMIN")
            || r.hostId.equals(a.id())
            || (r.members.containsKey(a.id()) && !r.members.get(a.id()).kicked));
  }

  void host(Actor a, Room r) {
    Errors.forbidden(a.staff() && (a.role().equals("ADMIN") || r.hostId.equals(a.id())));
  }

  @Transactional
  public Map<String, Object> create(
      Actor a, String quizId, boolean untimed, boolean advanceWhenReady, Integer questionCount) {
    return create(a, quizId, untimed, advanceWhenReady, questionCount, "LIVE", null);
  }

  @Transactional
  public Map<String, Object> create(
      Actor a,
      String quizId,
      boolean untimed,
      boolean advanceWhenReady,
      Integer questionCount,
      String mode,
      Integer durationMinutes) {
    Errors.forbidden(a.staff());
    String normalizedMode = mode == null || mode.isBlank() ? "LIVE" : mode.trim().toUpperCase();
    Errors.require(Set.of("LIVE", "EXAM").contains(normalizedMode), "Chế độ phòng không hợp lệ");
    Quiz q = s.get("quizzes", quizId, Quiz.class, false);
    Errors.require(q.status.equals("PUBLISHED"), "Bộ quiz chưa xuất bản");
    if (questionCount != null) {
      Errors.require(
          Set.of(10, 20, 50).contains(questionCount), "Chọn 10, 20, 50 câu hoặc toàn bộ bộ quiz");
      Errors.require(questionCount <= q.questions.size(), "Bộ quiz không đủ số câu đã chọn");
    }
    Room r = new Room();
    r.mode = normalizedMode;
    do {
      r.id = String.valueOf(100000 + random.nextInt(900000));
    } while (Boolean.TRUE.equals(
        s.db.queryForObject("select exists(select 1 from rooms where id=?)", Boolean.class, r.id)));
    r.hostId = a.id();
    r.quiz = q;
    r.shuffleAnswers = q.shuffle;
    if (q.shuffle || questionCount != null) {
      r.quiz.questions = new ArrayList<>(q.questions);
      Collections.shuffle(r.quiz.questions, random);
      if (questionCount != null)
        r.quiz.questions = new ArrayList<>(r.quiz.questions.subList(0, questionCount));
    }
    r.title = q.title;
    if ("EXAM".equals(normalizedMode)) {
      int defaultMinutes = Math.max(1, (int) Math.ceil((r.quiz.questions.size() * 40.0) / 60.0));
      int minutes =
          durationMinutes == null || durationMinutes == 0 ? defaultMinutes : durationMinutes;
      Errors.require(
          minutes >= 1 && minutes <= 180, "Thời gian làm bài phải từ 1 đến 180 phút");
      r.status = "LOBBY";
      r.untimed = false;
      r.advanceWhenReady = false;
      r.durationSeconds = minutes * 60;
      r.openedAt = 0;
      r.deadline = 0;
      r.current = -1;
    } else {
      r.untimed = untimed;
      r.advanceWhenReady = advanceWhenReady;
    }
    s.db.update("insert into rooms(id,data) values (?,?::jsonb)", r.id, s.write(r));
    save(r);
    return view(a, r);
  }

  @Transactional
  public Map<String, Object> join(Actor a, String code) {
    Room r = s.liveRoom(code, true);
    expire(r);
    Errors.forbidden(!r.bannedIds.contains(a.id()));
    Member existing = r.members.get(a.id());
    if (existing != null) {
      Errors.forbidden(!existing.kicked);
      return view(a, r);
    }
    if ("EXAM".equals(r.mode)) {
      boolean canJoin =
          !r.locked
              && (r.status.equals("LOBBY")
                  || (r.status.equals("OPEN") && System.currentTimeMillis() < r.deadline));
      Errors.require(canJoin, "Phòng thi đã kết thúc hoặc đang khóa");
    } else {
      Errors.require(r.status.equals("LOBBY") && !r.locked, "Phòng đã bắt đầu hoặc đang khóa");
    }
    // Compact old lobby bans without changing their identity or allowing re-entry.
    for (Member member : new ArrayList<>(r.members.values())) {
      if (member.kicked) {
        r.bannedIds.add(member.id);
        r.members.remove(member.id);
      }
    }
    Errors.require(
        r.bannedIds.size() < 1000, "Phòng đã đạt giới hạn loại người chơi. Hãy tạo phòng mới.");
    Errors.require(r.members.size() < 100, "Phòng đã đủ 100 người");
    Member m = new Member();
    m.id = a.id();
    m.name = a.name();
    m.joinedAt = System.currentTimeMillis();
    if (r.shuffleAnswers) {
      m.optionSeed = UUID.randomUUID().toString();
      if ("EXAM".equals(r.mode)) m.questionSeed = UUID.randomUUID().toString();
    }
    r.members.put(m.id, m);
    save(r);
    return view(a, r);
  }

  private boolean replayEligible(Actor a, Room r) {
    Member member = r.members.get(a.id());
    return !"EXAM".equals(r.mode)
        && !a.staff()
        && member != null
        && !member.kicked
        && r.status.equals("FINISHED")
        && !r.early
        && r.untimed
        && r.advanceWhenReady
        && r.quiz.questions.size() == 10;
  }

  private List<Question> replayPool(Room previous, Quiz source) {
    Set<String> excluded = new HashSet<>();
    previous.quiz.questions.forEach(q -> excluded.add(q.id));
    return new ArrayList<>(
        source.questions.stream().filter(q -> !excluded.contains(q.id)).toList());
  }

  @Transactional
  public Map<String, String> replay(Actor a, String code, String sourceIp) {
    Room previous = s.liveRoom(code, true);
    Member member = previous.members.get(a.id());
    Errors.forbidden(!a.staff() && member != null && !member.kicked);
    Errors.require(
        replayEligible(a, previous),
        "Hoàn thành phòng 10 câu tự chuyển, không giới hạn thời gian trước khi luyện tiếp.");
    String existing = previous.replays.get(a.id());
    if (existing != null) return Map.of("id", existing);
    Quiz source = s.get("quizzes", previous.quiz.id, Quiz.class, false);
    Errors.require(source.status.equals("PUBLISHED"), "Bộ quiz không còn mở để luyện tiếp.");
    List<Question> pool = replayPool(previous, source);
    Errors.require(pool.size() >= 10, "Bộ quiz không còn đủ 10 câu khác với lượt vừa làm.");
    s.db.queryForList(
        "select pg_advisory_xact_lock(hashtextextended(?, 0))", "room-replay:" + a.id());
    Long active =
        s.db.queryForObject(
            "select count(*) from rooms where data->>'personalReplay'='true' and"
                + " data->>'status'<>'FINISHED' and jsonb_exists(data->'members',?)",
            Long.class,
            a.id());
    Errors.require(
        active == null || active < 5,
        "Bạn đang có 5 lượt luyện chưa hoàn thành. Hãy hoàn thành lượt đang mở trước.");
    s.allocationBudget("replay-ip-minute:" + sourceIp, 200, 60000);
    s.allocationBudget("replay-global-minute", 600, 60000);
    s.allocationBudget("replay-ip-day:" + sourceIp, 5000, 86400000);
    s.allocationBudget("replay-global-day", 20000, 86400000);
    Collections.shuffle(pool, random);
    source.questions = new ArrayList<>(pool.subList(0, 10));
    Room next = new Room();
    do {
      next.id = String.valueOf(100000 + random.nextInt(900000));
    } while (Boolean.TRUE.equals(
        s.db.queryForObject(
            "select exists(select 1 from rooms where id=?)", Boolean.class, next.id)));
    next.hostId = previous.hostId;
    next.title = source.title;
    next.quiz = source;
    next.shuffleAnswers = previous.shuffleAnswers;
    next.personalReplay = true;
    next.untimed = previous.untimed;
    next.advanceWhenReady = previous.advanceWhenReady;
    Member learner = new Member();
    learner.id = a.id();
    learner.name = a.name();
    learner.joinedAt = System.currentTimeMillis();
    if (next.shuffleAnswers) learner.optionSeed = UUID.randomUUID().toString();
    next.members.put(a.id(), learner);
    advance(next);
    s.db.update("insert into rooms(id,data) values (?,?::jsonb)", next.id, s.write(next));
    save(next);
    previous.replays.put(a.id(), next.id);
    save(previous);
    return Map.of("id", next.id);
  }

  private boolean shouldExpire(Room r, long now) {
    if ("EXAM".equals(r.mode)) return r.status.equals("OPEN") && r.deadline > 0 && now >= r.deadline;
    return r.status.equals("QUESTION") && !r.untimed && r.deadline > 0 && now >= r.deadline;
  }

  @Transactional
  public Map<String, Object> get(Actor a, String code) {
    Room r = s.liveRoom(code, false);
    Errors.forbidden(access(a, r));
    long now = System.currentTimeMillis();
    if (shouldExpire(r, now)) {
      Room expired = s.tryExpiredRoom(code, now);
      if (expired != null) {
        r = expired;
        Errors.forbidden(access(a, r));
        expire(r);
      } else {
        // Another transaction may already be closing it. Never invent a reveal before commit.
        r = s.liveRoom(code, false);
        Errors.forbidden(access(a, r));
      }
    }
    return view(a, r);
  }

  void expire(Room r) {
    long now = System.currentTimeMillis();
    if ("EXAM".equals(r.mode) && r.status.equals("OPEN") && r.deadline > 0 && now >= r.deadline) {
      r.status = "FINISHED";
      r.finishedAt = r.deadline;
      save(r);
    } else if (r.status.equals("QUESTION") && !r.untimed && now >= r.deadline) {
      r.status = "REVEAL";
      save(r);
    }
  }

  @Transactional
  public void tick(String code) {
    Room r = s.liveRoom(code, true);
    expire(r);
  }

  @Transactional
  public Map<String, Object> examAnswer(Actor a, String code, PracticeService.Answer in) {
    Room r = s.liveRoom(code, false);
    Errors.require("EXAM".equals(r.mode), "Phòng này không ở chế độ làm cả đề");
    Member m = r.members.get(a.id());
    Errors.forbidden(m != null && !m.kicked);
    long now = System.currentTimeMillis();
    Errors.require(
        r.status.equals("OPEN") && (r.deadline == 0 || now < r.deadline),
        "Đã hết thời gian làm bài");
    Errors.require(m.submittedAt == 0, "Bạn đã nộp bài nên không thể đổi đáp án");
    Question q =
        r.quiz.questions.stream()
            .filter(x -> x.id.equals(in.questionId()))
            .findFirst()
            .orElse(null);
    Errors.require(q != null, "Câu hỏi không thuộc phòng này");
    var progress = s.examProgress(code, a.id(), true);
    if (in.answer() != null) {
      Errors.require(in.answer() >= 0 && in.answer() < 4, "Đáp án không hợp lệ");
      progress.answers.put(q.id, order(m, q).get(in.answer()));
      long start = Math.max(r.openedAt, m.joinedAt);
      progress.times.put(q.id, Math.max(0, now - start));
    }
    if (in.flagged() != null) {
      if (in.flagged()) progress.flagged.add(q.id);
      else progress.flagged.remove(q.id);
    }
    s.saveExamProgress(code, a.id(), progress);
    return buildView(a, r, progress);
  }

  @Transactional
  public Map<String, Object> submitExam(Actor a, String code) {
    Room r = s.liveRoom(code, true);
    expire(r);
    Errors.require("EXAM".equals(r.mode), "Phòng này không ở chế độ làm cả đề");
    Member m = r.members.get(a.id());
    Errors.forbidden(m != null && !m.kicked);
    if (r.status.equals("OPEN") && m.submittedAt == 0) {
      m.submittedAt = System.currentTimeMillis();
      save(r);
    }
    return view(a, r);
  }

  @Transactional
  public Map<String, Object> action(Actor a, String code, String action, String player) {
    Room r = s.liveRoom(code, true);
    host(a, r);
    expire(r);
    switch (action) {
      case "untimed" -> {
        Errors.require(r.status.equals("LOBBY"), "Chỉ đổi thời gian trước khi bắt đầu phòng");
        r.untimed = true;
      }
      case "lock" -> {
        Errors.require(
            r.status.equals("LOBBY") || ("EXAM".equals(r.mode) && r.status.equals("OPEN")),
            "Không thể đổi trạng thái khóa lúc này");
        r.locked = !r.locked;
      }
      case "kick" -> {
        Errors.require(
            (r.status.equals("LOBBY") || ("EXAM".equals(r.mode) && r.status.equals("OPEN")))
                && r.members.containsKey(player),
            "Không thể loại người chơi");
        Errors.require(
            r.bannedIds.size() < 1000, "Phòng đã đạt giới hạn loại người chơi. Hãy tạo phòng mới.");
        r.bannedIds.add(player);
        r.members.remove(player);
      }
      case "start" -> {
        Errors.require(r.status.equals("LOBBY"), "Trạng thái phòng đã thay đổi");
        if ("EXAM".equals(r.mode)) {
          r.status = "OPEN";
          r.openedAt = System.currentTimeMillis();
          r.deadline = r.openedAt + r.durationSeconds * 1000L;
          r.current = r.quiz.questions.size() - 1;
        } else {
          Errors.require(
              r.members.values().stream().anyMatch(m -> !m.kicked), "Cần ít nhất một người chơi");
          advance(r);
        }
      }
      case "next" -> {
        Errors.require(!"EXAM".equals(r.mode), "Phòng làm cả đề tự động chạy theo thời gian");
        Errors.require(r.status.equals("REVEAL"), "Trạng thái phòng đã thay đổi");
        Errors.require(
            r.members.values().stream().anyMatch(m -> !m.kicked), "Cần ít nhất một người chơi");
        advance(r);
      }
      case "finish" -> {
        Errors.require(!r.status.equals("FINISHED"), "Phòng đã kết thúc");
        long now = System.currentTimeMillis();
        if ("EXAM".equals(r.mode)) {
          r.early = r.status.equals("LOBBY") || (r.deadline > 0 && now < r.deadline);
          r.status = "FINISHED";
          r.finishedAt = now;
        } else {
          if (r.untimed && r.status.equals("QUESTION") && r.current >= 0) {
            String questionId = r.quiz.questions.get(r.current).id;
            long elapsed = Math.max(0, now - r.openedAt);
            r.members.values().stream()
                .filter(m -> !m.kicked)
                .forEach(m -> m.times.putIfAbsent(questionId, elapsed));
          }
          r.early = !r.status.equals("REVEAL") || r.current + 1 < r.quiz.questions.size();
          r.status = "FINISHED";
          r.finishedAt = now;
        }
      }
      default -> throw new IllegalArgumentException();
    }
    save(r);
    return view(a, r);
  }

  record AnswerCommand(Actor actor, String questionId, int choice, long receivedAt) {}

  private void advance(Room r) {
    if (r.current + 1 >= r.quiz.questions.size()) {
      r.status = "FINISHED";
      r.finishedAt = System.currentTimeMillis();
    } else {
      s.advanceRoom(r);
      r.current++;
      r.status = "QUESTION";
      r.openedAt = System.currentTimeMillis();
      r.deadline = r.untimed ? 0 : r.openedAt + r.quiz.questionSeconds * 1000L;
      r.locked = true;
    }
  }

  @Transactional
  public Map<String, Object> ready(Actor a, String code, String questionId) {
    Room r = s.liveRoom(code, true);
    Member m = r.members.get(a.id());
    Errors.forbidden(m != null && !m.kicked);
    Errors.require(
        r.status.equals("REVEAL")
            && r.current >= 0
            && r.quiz.questions.get(r.current).id.equals(questionId),
        "Câu hỏi đã thay đổi hoặc chưa hiển thị lời giải");
    if (!questionId.equals(m.readQuestionId)) {
      m.readQuestionId = questionId;
      if (r.advanceWhenReady
          && r.members.values().stream()
              .filter(member -> !member.kicked)
              .allMatch(member -> questionId.equals(member.readQuestionId))) advance(r);
      save(r);
    }
    // The host opts in when creating the room; one learner cannot skip peers' review.
    return view(a, r);
  }

  record AnswerOutcome(Map<String, Object> value, RuntimeException failure) {}

  /** One durable transaction per short burst; no result escapes until the proxy commits. */
  @Transactional
  public List<AnswerOutcome> answerBatch(String code, List<AnswerCommand> commands) {
    Room r = s.liveRoom(code, true);
    var failures = new ArrayList<RuntimeException>();
    boolean changed = false;
    int accepted = 0;
    for (var command : commands) {
      try {
        Actor a = command.actor();
        Member m = r.members.get(a.id());
        Errors.forbidden(m != null && !m.kicked);
        Errors.require(
            r.status.equals("QUESTION")
                && (r.untimed || System.currentTimeMillis() < r.deadline)
                && command.receivedAt() >= r.openedAt,
            "Câu hỏi đã đóng");
        Question q = r.quiz.questions.get(r.current);
        Errors.require(
            q.id.equals(command.questionId()) && command.choice() >= 0 && command.choice() < 4,
            "Câu hỏi hoặc đáp án không hợp lệ");
        if (!m.answers.containsKey(q.id)) {
          m.answers.put(q.id, order(m, q).get(command.choice()));
          // The server receive time excludes our batching wait, never a client-supplied time.
          m.times.put(q.id, Math.max(0, command.receivedAt() - r.openedAt));
          changed = true;
        }
        accepted++;
        failures.add(null);
      } catch (org.springframework.web.server.ResponseStatusException rejection) {
        failures.add(rejection);
      }
    }
    if (changed) {
      Question q = r.quiz.questions.get(r.current);
      if (r.members.values().stream()
          .filter(m -> !m.kicked)
          .allMatch(m -> m.answers.containsKey(q.id))) r.status = "REVEAL";
      save(r);
    }
    // A rejected burst must not commit even an automatic legacy-storage conversion.
    if (accepted == 0)
      org.springframework.transaction.interceptor.TransactionAspectSupport
          .currentTransactionStatus()
          .setRollbackOnly();
    var result = new ArrayList<AnswerOutcome>();
    for (int i = 0; i < commands.size(); i++) {
      RuntimeException failure = failures.get(i);
      result.add(
          new AnswerOutcome(failure == null ? view(commands.get(i).actor(), r) : null, failure));
    }
    return result;
  }

  List<Question> orderedQuestions(Room r, Member m) {
    if (m == null || m.questionSeed == null || m.questionSeed.isBlank()) return r.quiz.questions;
    try {
      byte[] digest =
          java.security.MessageDigest.getInstance("SHA-256")
              .digest(m.questionSeed.getBytes(java.nio.charset.StandardCharsets.UTF_8));
      var ordered = new ArrayList<>(r.quiz.questions);
      Collections.shuffle(ordered, new Random(java.nio.ByteBuffer.wrap(digest).getLong()));
      return ordered;
    } catch (java.security.NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }

  List<Integer> order(Member m, Question q) {
    if (m == null) return List.of(0, 1, 2, 3);
    if (m.optionOrders.containsKey(q.id)) return m.optionOrders.get(q.id);
    if (m.optionSeed == null || m.optionSeed.isBlank()) return List.of(0, 1, 2, 3);
    try {
      byte[] digest =
          java.security.MessageDigest.getInstance("SHA-256")
              .digest(
                  (m.optionSeed + ":" + q.id).getBytes(java.nio.charset.StandardCharsets.UTF_8));
      var order = new ArrayList<>(List.of(0, 1, 2, 3));
      Collections.shuffle(order, new Random(java.nio.ByteBuffer.wrap(digest).getLong()));
      return order;
    } catch (java.security.NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }

  Map<String, Object> playerQuestion(Question q, Member m, boolean reveal) {
    Map<String, Object> v = content.question(q, reveal);
    var order = order(m, q);
    v.put("options", order.stream().map(q.options::get).toList());
    if (reveal) v.put("correct", order.indexOf(q.correct));
    return v;
  }

  @Transactional
  public void integrity(Actor a, String code, Integrity.Event event) {
    Room r = s.liveRoom(code, true);
    Member m = r.members.get(a.id());
    Errors.forbidden(m != null && !m.kicked);
    long now = System.currentTimeMillis();
    boolean activeExam =
        "EXAM".equals(r.mode)
            && r.status.equals("OPEN")
            && m.submittedAt == 0
            && (r.deadline == 0 || now < r.deadline);
    boolean activeLive = r.status.equals("QUESTION") && (r.untimed || now < r.deadline);
    Errors.require(activeExam || activeLive, "Câu hỏi đã đóng");
    Integrity.record(m.integrityEvents, event);
    save(r);
  }

  long examMemberDuration(Room r, Member m) {
    if (r.openedAt <= 0) return 0L;
    long endCap =
        r.finishedAt > 0
            ? r.finishedAt
            : (r.deadline > 0 ? r.deadline : System.currentTimeMillis());
    long end = m.submittedAt > 0 ? Math.min(m.submittedAt, endCap) : endCap;
    long start = Math.max(r.openedAt, m.joinedAt);
    return Math.max(0L, end - start);
  }

  public List<Map<String, Object>> ranking(Room r) {
    boolean isExam = "EXAM".equals(r.mode);
    if (isExam) s.roomHistory(r, null);
    int n = isExam ? (r.current >= 0 ? r.quiz.questions.size() : 0) : r.current + 1;
    List<Map<String, Object>> list = new ArrayList<>();
    for (Member m : r.members.values()) {
      if (m.kicked) continue;
      int correct;
      long time;
      if (isExam) {
        correct =
            r.current >= 0
                ? (int)
                    r.quiz.questions.stream()
                        .filter(q -> Objects.equals(m.answers.get(q.id), q.correct))
                        .count()
                : 0;
        time = examMemberDuration(r, m);
      } else {
        correct = r.compact ? m.completedCorrect : 0;
        time = r.compact ? m.completedDurationMs : 0;
        for (int i = r.compact ? Math.max(0, r.current) : 0; i < n; i++) {
          Question q = r.quiz.questions.get(i);
          if (Objects.equals(m.answers.get(q.id), q.correct)) correct++;
          time += m.times.getOrDefault(q.id, r.quiz.questionSeconds * 1000L);
        }
      }
      var v = new LinkedHashMap<String, Object>();
      v.put("playerId", m.id);
      v.put("name", m.name);
      v.put("shortId", m.id.substring(0, 6));
      v.put("correct", correct);
      v.put("score", PracticeService.score(correct, n));
      v.put("durationMs", time);
      list.add(v);
    }
    list.sort(
        Comparator.<Map<String, Object>>comparingInt(v -> (int) v.get("correct"))
            .reversed()
            .thenComparingLong(v -> (long) v.get("durationMs"))
            .thenComparing(v -> (String) v.get("playerId")));
    int rank = 0;
    Map<String, Object> prev = null;
    for (int i = 0; i < list.size(); i++) {
      var v = list.get(i);
      if (prev == null
          || !v.get("correct").equals(prev.get("correct"))
          || !v.get("durationMs").equals(prev.get("durationMs"))) rank = i + 1;
      v.put("rank", rank);
      prev = v;
    }
    return list;
  }

  public Map<String, Object> view(Actor a, Room r) {
    return buildView(a, r, null);
  }

  private Map<String, Object> buildView(
      Actor a, Room r, RoomPersistence.ExamProgress preloadedProgress) {
    boolean isHost = a.staff() && (r.hostId.equals(a.id()) || a.role().equals("ADMIN"));
    boolean isExam = "EXAM".equals(r.mode);
    Map<String, Object> v = new LinkedHashMap<>();
    v.put("id", r.id);
    v.put("title", r.title);
    v.put("mode", isExam ? "EXAM" : "LIVE");
    v.put("durationSeconds", r.durationSeconds);
    v.put("status", r.status);
    v.put("host", isHost);
    v.put("version", r.version);
    v.put("serverTime", System.currentTimeMillis());
    v.put("deadline", r.deadline);
    v.put("untimed", r.untimed);
    v.put("advanceWhenReady", r.advanceWhenReady);
    v.put("personalReplay", r.personalReplay);
    if (replayEligible(a, r)) {
      String existing = r.replays.get(a.id());
      if (existing != null) {
        v.put("replayAvailable", true);
        v.put("replayRoomId", existing);
      } else {
        Quiz source = s.get("quizzes", r.quiz.id, Quiz.class, false);
        boolean available =
            source != null
                && source.status.equals("PUBLISHED")
                && replayPool(r, source).size() >= 10;
        v.put("replayAvailable", available);
        if (!available)
          v.put("replayReason", "Bộ quiz chưa có đủ 10 câu khác đang mở để luyện tiếp.");
      }
    }
    v.put("locked", r.locked);
    v.put("early", r.early);
    v.put("current", r.current);
    v.put("count", r.quiz.questions.size());
    v.put("shuffleAnswers", r.shuffleAnswers);
    v.put("openedAt", r.openedAt);
    if (isHost)
      v.put(
          "integrity",
          r.members.values().stream()
              .filter(m -> !m.kicked)
              .map(
                  m ->
                      Map.of(
                          "playerId",
                          m.id,
                          "name",
                          m.name,
                          "signals",
                          Integrity.summary(m.integrityEvents)))
              .toList());
    v.put(
        "members",
        r.members.values().stream()
            .filter(m -> !m.kicked)
            .map(
                m ->
                    Map.<String, Object>of(
                        "id",
                        m.id,
                        "name",
                        m.name,
                        "shortId",
                        m.id.substring(0, 6),
                        "submitted",
                        m.submittedAt > 0))
            .toList());
    // Never expose rankings during active questions (QUESTION, REVEAL, OPEN); reveal only on FINISHED.
    v.put("ranking", r.status.equals("FINISHED") ? ranking(r) : List.of());
    if (isExam) {
      Member mine = r.members.get(a.id());
      long submittedCount =
          r.members.values().stream().filter(m -> !m.kicked && m.submittedAt > 0).count();
      v.put("submittedCount", submittedCount);
      v.put("answered", submittedCount);
      v.put("myAnswer", -1);
      v.put("mySubmitted", mine != null && mine.submittedAt > 0);
      if (r.status.equals("OPEN") && !isHost && mine != null) {
        var progress =
            preloadedProgress != null
                ? preloadedProgress
                : s.examProgress(r.id, mine.id, false);
        var ordered = orderedQuestions(r, mine);
        v.put("examQuestions", ordered.stream().map(q -> playerQuestion(q, mine, false)).toList());
        var mappedAnswers = new LinkedHashMap<String, Integer>();
        for (Question q : ordered) {
          Integer canonical = progress.answers.get(q.id);
          if (canonical != null) {
            int idx = order(mine, q).indexOf(canonical);
            if (idx >= 0) mappedAnswers.put(q.id, idx);
          }
        }
        v.put("examAnswers", mappedAnswers);
        v.put("examFlagged", new ArrayList<>(progress.flagged));
      }
    } else if (r.current >= 0) {
      Question q = r.quiz.questions.get(r.current);
      boolean reveal = !r.status.equals("QUESTION");
      Member mine = r.members.get(a.id());
      v.put(
          "myReady", r.status.equals("REVEAL") && mine != null && q.id.equals(mine.readQuestionId));
      if (isHost && r.status.equals("REVEAL"))
        v.put(
            "readyPlayers",
            r.members.values().stream()
                .filter(m -> !m.kicked && q.id.equals(m.readQuestionId))
                .map(m -> m.id)
                .toList());
      Member displayed = isHost ? null : mine;
      var order = order(displayed, q);
      v.put("question", playerQuestion(q, displayed, reveal));
      v.put("myAnswer", mine == null ? -1 : order.indexOf(mine.answers.getOrDefault(q.id, -1)));
      v.put(
          "answered",
          r.members.values().stream()
              .filter(m -> !m.kicked && m.answers.containsKey(q.id))
              .count());
      if (reveal) {
        v.put(
            "distribution",
            order.stream()
                .map(
                    i ->
                        r.members.values().stream()
                            .filter(m -> !m.kicked && Objects.equals(m.answers.get(q.id), i))
                            .count())
                .toList());
      }
    }
    if (r.status.equals("FINISHED")) {
      if (!isExam) s.roomHistory(r, isHost ? null : a.id());
      var detail = new ArrayList<Map<String, Object>>();
      for (Member m : r.members.values())
        if (!m.kicked && (isHost || m.id.equals(a.id()))) {
          List<Question> questionsForDetail =
              isExam
                  ? (r.current >= 0 ? orderedQuestions(r, isHost ? null : m) : List.of())
                  : r.quiz.questions.subList(0, r.current + 1);
          long fallbackDuration =
              isExam ? examMemberDuration(r, m) : r.quiz.questionSeconds * 1000L;
          detail.add(
              Map.of(
                  "playerId",
                  m.id,
                  "name",
                  m.name,
                  "questions",
                  questionsForDetail.stream()
                      .map(
                          q ->
                              Map.of(
                                  "question",
                                  playerQuestion(q, isHost ? null : m, true),
                                  "answer",
                                  order(isHost ? null : m, q)
                                      .indexOf(m.answers.getOrDefault(q.id, -1)),
                                  "durationMs",
                                  m.times.getOrDefault(q.id, fallbackDuration)))
                      .toList()));
        }
      v.put("details", detail);
    }
    return v;
  }
}
