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
  public Map<String, Object> create(Actor a, String quizId) {
    Errors.forbidden(a.staff());
    Quiz q = s.get("quizzes", quizId, Quiz.class, false);
    Errors.require(q.status.equals("PUBLISHED"), "Bộ quiz chưa xuất bản");
    Room r = new Room();
    do {
      r.id = String.valueOf(100000 + random.nextInt(900000));
    } while (Boolean.TRUE.equals(
        s.db.queryForObject("select exists(select 1 from rooms where id=?)", Boolean.class, r.id)));
    r.hostId = a.id();
    r.quiz = q;
    r.shuffleAnswers = q.shuffle;
    if (q.shuffle) {
      r.quiz.questions = new ArrayList<>(q.questions);
      Collections.shuffle(r.quiz.questions, random);
    }
    r.title = q.title;
    s.db.update("insert into rooms(id,data) values (?,?::jsonb)", r.id, s.write(r));
    save(r);
    return view(a, r);
  }

  @Transactional
  public Map<String, Object> join(Actor a, String code) {
    Room r = s.get("rooms", code, Room.class, true);
    Errors.forbidden(!r.bannedIds.contains(a.id()));
    Member existing = r.members.get(a.id());
    if (existing != null) {
      Errors.forbidden(!existing.kicked);
      return view(a, r);
    }
    Errors.require(r.status.equals("LOBBY") && !r.locked, "Phòng đã bắt đầu hoặc đang khóa");
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
    if (r.shuffleAnswers) m.optionSeed = UUID.randomUUID().toString();
    r.members.put(m.id, m);
    save(r);
    return view(a, r);
  }

  @Transactional
  public Map<String, Object> get(Actor a, String code) {
    Room r = s.get("rooms", code, Room.class, false);
    Errors.forbidden(access(a, r));
    if (r.status.equals("QUESTION") && System.currentTimeMillis() >= r.deadline) {
      r = s.get("rooms", code, Room.class, true);
      Errors.forbidden(access(a, r));
      expire(r);
    }
    return view(a, r);
  }

  void expire(Room r) {
    if (r.status.equals("QUESTION") && System.currentTimeMillis() >= r.deadline) {
      r.status = "REVEAL";
      save(r);
    }
  }

  @Transactional
  public void tick(String code) {
    Room r = s.get("rooms", code, Room.class, true);
    expire(r);
  }

  @Transactional
  public Map<String, Object> action(Actor a, String code, String action, String player) {
    Room r = s.get("rooms", code, Room.class, true);
    host(a, r);
    expire(r);
    switch (action) {
      case "lock" -> {
        Errors.require(r.status.equals("LOBBY"), "Chỉ khóa phòng chờ");
        r.locked = !r.locked;
      }
      case "kick" -> {
        Errors.require(
            r.status.equals("LOBBY") && r.members.containsKey(player), "Không thể loại người chơi");
        Errors.require(
            r.bannedIds.size() < 1000, "Phòng đã đạt giới hạn loại người chơi. Hãy tạo phòng mới.");
        r.bannedIds.add(player);
        r.members.remove(player);
      }
      case "start", "next" -> {
        Errors.require(
            (action.equals("start") && r.status.equals("LOBBY"))
                || (action.equals("next") && r.status.equals("REVEAL")),
            "Trạng thái phòng đã thay đổi");
        Errors.require(
            r.members.values().stream().anyMatch(m -> !m.kicked), "Cần ít nhất một người chơi");
        if (r.current + 1 >= r.quiz.questions.size()) {
          r.status = "FINISHED";
          r.finishedAt = System.currentTimeMillis();
        } else {
          r.current++;
          r.status = "QUESTION";
          r.openedAt = System.currentTimeMillis();
          r.deadline = r.openedAt + r.quiz.questionSeconds * 1000L;
          r.locked = true;
        }
      }
      case "finish" -> {
        Errors.require(!r.status.equals("FINISHED"), "Phòng đã kết thúc");
        r.early = !r.status.equals("REVEAL") || r.current + 1 < r.quiz.questions.size();
        r.status = "FINISHED";
        r.finishedAt = System.currentTimeMillis();
      }
      default -> throw new IllegalArgumentException();
    }
    save(r);
    return view(a, r);
  }

  @Transactional
  public Map<String, Object> answer(Actor a, String code, String questionId, int choice) {
    Room r = s.get("rooms", code, Room.class, true);
    Errors.forbidden(r.members.containsKey(a.id()) && !r.members.get(a.id()).kicked);
    expire(r);
    Errors.require(
        r.status.equals("QUESTION") && System.currentTimeMillis() < r.deadline, "Câu hỏi đã đóng");
    Question q = r.quiz.questions.get(r.current);
    Errors.require(
        q.id.equals(questionId) && choice >= 0 && choice < 4, "Câu hỏi hoặc đáp án không hợp lệ");
    Member m = r.members.get(a.id());
    if (!m.answers.containsKey(q.id)) {
      m.answers.put(q.id, order(m, q).get(choice));
      m.times.put(q.id, Math.max(0, System.currentTimeMillis() - r.openedAt));
      if (r.members.values().stream()
          .filter(x -> !x.kicked)
          .allMatch(x -> x.answers.containsKey(q.id))) r.status = "REVEAL";
      save(r);
    }
    return view(a, r);
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
    Room r = s.get("rooms", code, Room.class, true);
    Member m = r.members.get(a.id());
    Errors.forbidden(m != null && !m.kicked);
    Errors.require(
        r.status.equals("QUESTION") && System.currentTimeMillis() < r.deadline, "Câu hỏi đã đóng");
    Integrity.record(m.integrityEvents, event);
    save(r);
  }

  public List<Map<String, Object>> ranking(Room r) {
    int n = r.current + 1;
    List<Map<String, Object>> list = new ArrayList<>();
    for (Member m : r.members.values()) {
      if (m.kicked) continue;
      int correct = 0;
      long time = 0;
      for (int i = 0; i < n; i++) {
        Question q = r.quiz.questions.get(i);
        if (Objects.equals(m.answers.get(q.id), q.correct)) correct++;
        time += m.times.getOrDefault(q.id, r.quiz.questionSeconds * 1000L);
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
    boolean isHost = a.staff() && (r.hostId.equals(a.id()) || a.role().equals("ADMIN"));
    Map<String, Object> v = new LinkedHashMap<>();
    v.put("id", r.id);
    v.put("title", r.title);
    v.put("status", r.status);
    v.put("host", isHost);
    v.put("version", r.version);
    v.put("serverTime", System.currentTimeMillis());
    v.put("deadline", r.deadline);
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
            .map(m -> Map.of("id", m.id, "name", m.name, "shortId", m.id.substring(0, 6)))
            .toList());
    v.put("ranking", r.status.equals("QUESTION") ? List.of() : ranking(r));
    if (r.current >= 0) {
      Question q = r.quiz.questions.get(r.current);
      boolean reveal = !r.status.equals("QUESTION");
      Member mine = r.members.get(a.id());
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
      var detail = new ArrayList<Map<String, Object>>();
      for (Member m : r.members.values())
        if (!m.kicked && (isHost || m.id.equals(a.id()))) {
          detail.add(
              Map.of(
                  "playerId",
                  m.id,
                  "name",
                  m.name,
                  "questions",
                  r.quiz.questions.subList(0, r.current + 1).stream()
                      .map(
                          q ->
                              Map.of(
                                  "question",
                                  playerQuestion(q, isHost ? null : m, true),
                                  "answer",
                                  order(isHost ? null : m, q)
                                      .indexOf(m.answers.getOrDefault(q.id, -1)),
                                  "durationMs",
                                  m.times.getOrDefault(q.id, r.quiz.questionSeconds * 1000L)))
                      .toList()));
        }
      v.put("details", detail);
    }
    return v;
  }
}
