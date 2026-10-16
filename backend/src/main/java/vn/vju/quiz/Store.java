package vn.vju.quiz;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
public class Store {
  final JdbcTemplate db;
  final ObjectMapper json;
  final RoomPersistence rooms;
  private final java.util.concurrent.atomic.AtomicLong contentRevision =
      new java.util.concurrent.atomic.AtomicLong();

  public long contentRevision() {
    return contentRevision.get();
  }

  private void contentChanged(String table) {
    if (!Set.of("chapters", "questions", "quizzes").contains(table)) return;
    if (org.springframework.transaction.support.TransactionSynchronizationManager
        .isSynchronizationActive()) {
      org.springframework.transaction.support.TransactionSynchronizationManager
          .registerSynchronization(
              new org.springframework.transaction.support.TransactionSynchronization() {
                public void afterCommit() {
                  contentRevision.incrementAndGet();
                }
              });
    } else contentRevision.incrementAndGet();
  }

  private static final Set<String> TABLES =
      Set.of("chapters", "questions", "quizzes", "attempts", "rooms");

  public Store(JdbcTemplate db, ObjectMapper json) {
    this.db = db;
    this.json = json;
    this.rooms = new RoomPersistence(db, json);
  }

  private String table(String s) {
    if (!TABLES.contains(s)) throw new IllegalArgumentException();
    return s;
  }

  public <T> T get(String table, String id, Class<T> type, boolean lock) {
    if (table.equals("rooms")) return type.cast(rooms.get(id, lock, true));
    var rows =
        db.queryForList(
            "select data::text from " + table(table) + " where id=?" + (lock ? " for update" : ""),
            String.class,
            id);
    if (rows.isEmpty())
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy dữ liệu");
    return read(rows.getFirst(), type);
  }

  public <T> List<T> all(String table, Class<T> type) {
    return db.queryForList("select data::text from " + table(table), String.class).stream()
        .map(s -> table.equals("rooms") ? type.cast(rooms.decode(s, true)) : read(s, type))
        .toList();
  }

  public <T> List<T> by(String table, String field, String value, Class<T> type) {
    if (!Set.of("playerId", "quizId", "chapterId").contains(field))
      throw new IllegalArgumentException();
    return db
        .queryForList(
            "select data::text from " + table(table) + " where data->>'" + field + "'=?",
            String.class,
            value)
        .stream()
        .map(s -> read(s, type))
        .toList();
  }

  public Domain.Room liveRoom(String id, boolean lock) {
    return rooms.get(id, lock, false);
  }

  public Domain.Room tryExpiredRoom(String id, long now) {
    return rooms.tryExpired(id, now);
  }

  public void roomHistory(Domain.Room room, String playerId) {
    rooms.history(room, playerId);
  }

  public void advanceRoom(Domain.Room room) {
    rooms.advance(room);
  }

  public void save(String table, String id, Object value) {
    if (table.equals("rooms")) {
      rooms.save((Domain.Room) value);
      return;
    }
    db.update(
        "insert into "
            + table(table)
            + " (id,data) values (?,?::jsonb) on conflict(id) do update set data=excluded.data",
        id,
        write(value));
    contentChanged(table);
  }

  // Called inside PracticeService.start's transaction. The lock also covers concurrent tabs.
  public void guardActiveAttempts(String playerId) {
    db.queryForList("select pg_advisory_xact_lock(hashtextextended(?, 0))", "attempt:" + playerId);
    Long count =
        db.queryForObject(
            "select count(*) from attempts where data->>'playerId'=? and data->>'status'='ACTIVE'"
                + " and ((data->>'deadline')::bigint=0 or (data->>'deadline')::bigint>?)",
            Long.class,
            playerId,
            System.currentTimeMillis());
    if (count != null && count >= 5)
      throw new ResponseStatusException(
          HttpStatus.TOO_MANY_REQUESTS,
          "Bạn đang có 5 bài chưa hoàn thành. Mở Lịch sử để tiếp tục hoặc nộp bài trước.");
  }

  // Atomic, persistent fixed-window budgets cannot be reset by changing a guest cookie.
  public void allocationBudget(String key, int maximum, long windowMs) {
    long bucket = System.currentTimeMillis() / windowMs;
    var accepted =
        db.queryForList(
            "insert into allocation_budgets(scope, bucket, expires_at, used) values (?, ?, ?, 1) on"
                + " conflict(scope,bucket) do update set used=allocation_budgets.used+1 where"
                + " allocation_budgets.used<? returning used",
            Integer.class,
            key,
            bucket,
            (bucket + 1) * windowMs,
            maximum);
    if (accepted.isEmpty())
      throw new ResponseStatusException(
          HttpStatus.TOO_MANY_REQUESTS,
          "Đã đạt giới hạn tạo bài. Vui lòng tiếp tục bài đang làm hoặc thử lại sau.");
  }

  public String write(Object v) {
    try {
      return json.writeValueAsString(v);
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  public <T> T read(String s, Class<T> c) {
    try {
      return json.readValue(s, c);
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  public <T> T copy(T v, Class<T> c) {
    return read(write(v), c);
  }
}
