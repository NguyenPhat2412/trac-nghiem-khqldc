package vn.vju.quiz;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.*;
import org.springframework.web.server.ResponseStatusException;
import vn.vju.quiz.Domain.*;

/** Durable compact room state; only immutable quiz snapshots are cached. */
final class RoomPersistence {
  private final JdbcTemplate db;
  private final ObjectMapper json;
  private final ObjectMapper coreJson;

  @JsonIgnoreProperties("quiz")
  private abstract static class CoreOnly {}

  private final LinkedHashMap<String, Snapshot> snapshots = new LinkedHashMap<>(16, .75f, true);
  private long cacheWeight;

  private record Snapshot(Quiz quiz, long weight) {}

  RoomPersistence(JdbcTemplate db, ObjectMapper json) {
    this.db = db;
    this.json = json;
    this.coreJson = json.copy().addMixIn(Room.class, CoreOnly.class);
  }

  private String write(Object value) {
    try {
      return json.writeValueAsString(value);
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  private <T> T read(String value, Class<T> type) {
    try {
      return json.readValue(value, type);
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  private void cacheAfterCommit(String id, String raw) {
    // Never publish an uncommitted snapshot. Parse a separate object from the caller's mutable
    // quiz.
    Runnable insert =
        () -> {
          var value = new Snapshot(read(raw, Quiz.class), raw.length() * 4L + 4096);
          synchronized (snapshots) {
            if (snapshots.containsKey(id) || value.weight > 32 * 1024 * 1024) return;
            snapshots.put(id, value);
            cacheWeight += value.weight;
            while (snapshots.size() > 128 || cacheWeight > 32 * 1024 * 1024) {
              var first = snapshots.entrySet().iterator();
              cacheWeight -= first.next().getValue().weight;
              first.remove();
            }
          }
        };
    if (TransactionSynchronizationManager.isSynchronizationActive())
      TransactionSynchronizationManager.registerSynchronization(
          new TransactionSynchronization() {
            public void afterCommit() {
              insert.run();
            }
          });
    else insert.run();
  }

  private Quiz snapshot(String id) {
    synchronized (snapshots) {
      Snapshot cached = snapshots.get(id);
      if (cached != null) return cached.quiz;
    }
    String raw =
        db.queryForObject(
            "select data::text from room_snapshots where room_id=?", String.class, id);
    Quiz quiz = read(raw, Quiz.class);
    cacheAfterCommit(id, raw);
    return quiz;
  }

  Room get(String id, boolean lock, boolean full) {
    var rows =
        db.queryForList(
            "select data::text from rooms where id=?" + (lock ? " for update" : ""),
            String.class,
            id);
    if (rows.isEmpty())
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy dữ liệu");
    Room room = decode(rows.getFirst(), full);
    if (lock && !room.compact) save(room);
    return room;
  }

  Room tryExpired(String id, long now) {
    // A burst of expired reads must not queue another durable row lock per reader.
    // The winner commits the transition; other readers see committed state and its event.
    var rows =
        db.queryForList(
            "select data::text from rooms where id=? and data->>'status'='QUESTION' and"
                + " (data->>'deadline')::bigint>0 and (data->>'deadline')::bigint<=? for update"
                + " skip locked",
            String.class,
            id,
            now);
    if (rows.isEmpty()) return null;
    Room room = decode(rows.getFirst(), false);
    if (!room.compact) save(room);
    return room;
  }

  Room decode(String raw, boolean full) {
    Room room = read(raw, Room.class);
    if (room.compact) {
      // Snapshot is immutable after publication: callers must never mutate it.
      room.quiz = snapshot(room.id);
      if (full) history(room, null);
    }
    return room;
  }

  void history(Room room, String playerId) {
    if (!room.compact) return;
    db.query(
        "select player_id, data::text from room_history where room_id=?"
            + (playerId == null ? "" : " and player_id=?"),
        rs -> {
          Member member = room.members.get(rs.getString(1));
          if (member != null) {
            Member previous = read(rs.getString(2), Member.class);
            // Current committed choices take precedence over archived/legacy entries.
            previous.answers.forEach(member.answers::putIfAbsent);
            previous.times.forEach(member.times::putIfAbsent);
          }
        },
        playerId == null ? new Object[] {room.id} : new Object[] {room.id, playerId});
  }

  private void archive(Room room) {
    var rows = new ArrayList<Object[]>();
    for (Member m : room.members.values()) {
      if (!m.answers.isEmpty() || !m.times.isEmpty())
        rows.add(
            new Object[] {room.id, m.id, write(Map.of("answers", m.answers, "times", m.times))});
    }
    db.batchUpdate(
        "insert into room_history(room_id,player_id,data) values (?,?,?::jsonb) "
            + "on conflict(room_id,player_id) do update set data=jsonb_build_object("
            + "'answers',(room_history.data->'answers') || (excluded.data->'answers'),"
            + "'times',(room_history.data->'times') || (excluded.data->'times'))",
        rows);
  }

  static void compactLegacy(Room room) {
    for (Member m : room.members.values()) {
      m.completedCorrect = 0;
      m.completedDurationMs = 0;
      for (int i = 0; i < room.current; i++) addCompleted(room, m, room.quiz.questions.get(i));
      String current = room.current >= 0 ? room.quiz.questions.get(room.current).id : "";
      m.answers.keySet().removeIf(id -> !id.equals(current));
      m.times.keySet().removeIf(id -> !id.equals(current));
    }
    room.compact = true;
  }

  private static void addCompleted(Room r, Member m, Question q) {
    if (Objects.equals(m.answers.get(q.id), q.correct)) m.completedCorrect++;
    m.completedDurationMs += m.times.getOrDefault(q.id, r.quiz.questionSeconds * 1000L);
  }

  void advance(Room room) {
    if (!room.compact || room.current < 0) return;
    archive(room);
    Question previous = room.quiz.questions.get(room.current);
    for (Member m : room.members.values()) {
      addCompleted(room, m, previous);
      m.answers.clear();
      m.times.clear();
    }
  }

  void save(Room room) {
    if (!room.compact) {
      String raw = write(room.quiz);
      db.update("insert into room_snapshots(room_id,data) values (?,?::jsonb)", room.id, raw);
      archive(room);
      compactLegacy(room);
      cacheAfterCommit(room.id, raw);
    }
    try {
      db.update(
          "update rooms set data=?::jsonb where id=?", coreJson.writeValueAsString(room), room.id);
    } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
      throw new IllegalStateException(e);
    }
  }
}
