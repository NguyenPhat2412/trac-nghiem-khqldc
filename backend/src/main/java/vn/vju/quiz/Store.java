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
  private static final Set<String> TABLES =
      Set.of("chapters", "questions", "quizzes", "attempts", "rooms");

  public Store(JdbcTemplate db, ObjectMapper json) {
    this.db = db;
    this.json = json;
  }

  private String table(String s) {
    if (!TABLES.contains(s)) throw new IllegalArgumentException();
    return s;
  }

  public <T> T get(String table, String id, Class<T> type, boolean lock) {
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
        .map(s -> read(s, type))
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

  public void save(String table, String id, Object value) {
    db.update(
        "insert into "
            + table(table)
            + " (id,data) values (?,?::jsonb) on conflict(id) do update set data=excluded.data",
        id,
        write(value));
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
