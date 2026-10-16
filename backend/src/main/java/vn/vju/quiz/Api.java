package vn.vju.quiz;

import java.util.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import vn.vju.quiz.Domain.*;

@RestController
@RequestMapping("/api")
public class Api {
  final Store s;
  final ContentService c;
  final PracticeService p;
  final RoomService r;
  final ExcelService excel;
  final Reports reports;
  final Auth auth;
  final RoomAnswers roomAnswers;

  public Api(
      Store s,
      ContentService c,
      PracticeService p,
      RoomService r,
      ExcelService e,
      Reports reports,
      Auth auth,
      RoomAnswers roomAnswers) {
    this.s = s;
    this.c = c;
    this.p = p;
    this.r = r;
    excel = e;
    this.reports = reports;
    this.auth = auth;
    this.roomAnswers = roomAnswers;
  }

  @GetMapping("/catalog")
  Object catalog() {
    return c.catalog();
  }

  @PostMapping("/attempts")
  Object start(
      @RequestBody PracticeService.Start in, jakarta.servlet.http.HttpServletRequest request) {
    var a = Auth.actor();
    auth.limit("attempt:" + a.id(), 20);
    String source =
        java.util
            .UUID
            .nameUUIDFromBytes(
                request.getRemoteAddr().getBytes(java.nio.charset.StandardCharsets.UTF_8))
            .toString();
    s.allocationBudget("attempt-ip-minute:" + source, 200, 60000);
    s.allocationBudget("attempt-global-minute", 600, 60000);
    s.allocationBudget("attempt-ip-day:" + source, 5000, 86400000);
    s.allocationBudget("attempt-global-day", 20000, 86400000);
    return p.start(a, in);
  }

  @GetMapping("/attempts/{id}")
  Object attempt(@PathVariable String id) {
    return p.get(Auth.actor(), id);
  }

  @PutMapping("/attempts/{id}/answer")
  Object answer(@PathVariable String id, @RequestBody PracticeService.Answer in) {
    return p.answer(Auth.actor(), id, in);
  }

  @PostMapping("/attempts/{id}/submit")
  Object submit(@PathVariable String id) {
    return p.submit(Auth.actor(), id);
  }

  @PostMapping("/attempts/{id}/integrity")
  Object attemptIntegrity(@PathVariable String id, @RequestBody Integrity.Event event) {
    var a = Auth.actor();
    auth.limit("integrity:" + a.id(), 120);
    p.integrity(a, id, event);
    return Map.of("ok", true);
  }

  @PostMapping("/rooms/{code}/integrity")
  Object roomIntegrity(@PathVariable String code, @RequestBody Integrity.Event event) {
    var a = Auth.actor();
    auth.limit("integrity:" + a.id(), 120);
    r.integrity(a, code, event);
    return Map.of("ok", true);
  }

  @GetMapping("/history")
  Object history() {
    return p.history(Auth.actor());
  }

  @GetMapping("/leaderboard/{id}")
  Object board(@PathVariable String id) {
    return p.leaderboard(id);
  }

  @PostMapping("/rooms/{code}/join")
  Object join(@PathVariable String code) {
    var a = Auth.actor();
    auth.limit("join:" + a.id(), 20);
    return r.join(a, code);
  }

  @GetMapping("/rooms/{code}")
  Object room(@PathVariable String code) {
    return r.get(Auth.actor(), code);
  }

  @PostMapping("/rooms/{code}/answer")
  java.util.concurrent.CompletableFuture<Map<String, Object>> roomAnswer(
      @PathVariable String code, @RequestBody PracticeService.Answer in) {
    Errors.require(in.answer() != null, "Chọn một đáp án");
    var actor = Auth.actor();
    auth.limit("room-answer:" + actor.id(), 240);
    return roomAnswers.submit(actor, code, in.questionId(), in.answer());
  }

  @PostMapping("/admin/rooms")
  Object createRoom(@RequestBody Map<String, String> b) {
    return r.create(Auth.actor(), b.get("quizId"));
  }

  @PostMapping("/rooms/{code}/ready")
  Object roomReady(@PathVariable String code, @RequestBody Map<String, String> body) {
    var actor = Auth.actor();
    auth.limit("room-ready:" + actor.id(), 120);
    return r.ready(actor, code, body.get("questionId"));
  }

  @PostMapping("/admin/rooms/{code}/{action}")
  Object roomAction(
      @PathVariable String code,
      @PathVariable String action,
      @RequestBody(required = false) Map<String, String> b) {
    return r.action(Auth.actor(), code, action, b == null ? null : b.get("playerId"));
  }

  @GetMapping("/admin/rooms")
  Object myRooms() {
    var a = Auth.actor();
    return s.all("rooms", Room.class).stream()
        .filter(x -> a.role().equals("ADMIN") || x.hostId.equals(a.id()))
        .sorted(Comparator.comparingLong((Room x) -> x.createdAt).reversed())
        .map(
            x ->
                Map.of(
                    "id",
                    x.id,
                    "title",
                    x.title,
                    "status",
                    x.status,
                    "players",
                    x.members.values().stream().filter(m -> !m.kicked).count(),
                    "createdAt",
                    x.createdAt))
        .toList();
  }

  @GetMapping("/admin/chapters")
  Object chapters() {
    return s.all("chapters", Chapter.class).stream()
        .sorted(Comparator.comparingInt(x -> x.position))
        .toList();
  }

  @PostMapping("/admin/chapters")
  Object chapter(@RequestBody Chapter in) {
    return c.chapter(in, null);
  }

  @PutMapping("/admin/chapters/{id}")
  Object chapterEdit(@PathVariable String id, @RequestBody Chapter in) {
    return c.chapter(in, id);
  }

  @GetMapping("/admin/questions")
  Object questions() {
    return s.all("questions", Question.class);
  }

  @PostMapping("/admin/questions")
  Object question(@RequestBody Question in) {
    return c.questionSave(in, null);
  }

  @PutMapping("/admin/questions/{id}")
  Object questionEdit(@PathVariable String id, @RequestBody Question in) {
    return c.questionSave(in, id);
  }

  @GetMapping("/admin/quizzes")
  Object quizzes() {
    return s.all("quizzes", Quiz.class).stream()
        .sorted(Comparator.comparingLong((Quiz q) -> q.createdAt).reversed())
        .toList();
  }

  @PostMapping("/admin/quizzes")
  Object quiz(@RequestBody ContentService.QuizInput in) {
    return c.quiz(in, null);
  }

  @PutMapping("/admin/quizzes/{id}")
  Object quizEdit(@PathVariable String id, @RequestBody ContentService.QuizInput in) {
    return c.quiz(in, id);
  }

  @GetMapping("/admin/import/template")
  ResponseEntity<byte[]> template() throws Exception {
    return ResponseEntity.ok()
        .header("Content-Disposition", "attachment; filename=vju-cau-hoi.xlsx")
        .contentType(
            MediaType.parseMediaType(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
        .body(excel.template());
  }

  @PostMapping("/admin/import/preview")
  Object preview(@RequestParam MultipartFile file) throws Exception {
    return excel.preview(file.getInputStream());
  }

  @PostMapping("/admin/import/commit")
  Object importCommit(@RequestBody List<Question> rows) {
    return excel.commit(rows);
  }

  @GetMapping("/admin/report")
  Object report(
      @RequestParam(defaultValue = "0") long from,
      @RequestParam(defaultValue = "9223372036854775807") long to,
      @RequestParam(defaultValue = "") String chapter,
      @RequestParam(defaultValue = "") String quiz,
      @RequestParam(defaultValue = "") String room) {
    return reports.report(Auth.actor(), from, to, chapter, quiz, room);
  }

  @GetMapping("/admin/report.csv")
  ResponseEntity<String> csv(
      @RequestParam(defaultValue = "0") long from,
      @RequestParam(defaultValue = "9223372036854775807") long to,
      @RequestParam(defaultValue = "") String chapter,
      @RequestParam(defaultValue = "") String quiz,
      @RequestParam(defaultValue = "") String room) {
    return ResponseEntity.ok()
        .header("Content-Disposition", "attachment; filename=vju-ket-qua.csv")
        .contentType(MediaType.parseMediaType("text/csv;charset=UTF-8"))
        .body(reports.csv(reports.report(Auth.actor(), from, to, chapter, quiz, room)));
  }

  @GetMapping("/admin/staff")
  Object staff() {
    Errors.forbidden(Auth.actor().role().equals("ADMIN"));
    return s.db.queryForList("select id,username,name,role,enabled from staff order by username");
  }

  public record StaffInput(
      String username, String name, String password, String role, boolean enabled) {}

  @PostMapping("/admin/staff")
  Object addStaff(@RequestBody StaffInput in) {
    Errors.forbidden(Auth.actor().role().equals("ADMIN"));
    String username = Errors.text(in.username(), 60),
        name = Errors.text(in.name(), 80),
        password = Errors.text(in.password(), 100);
    Errors.require(
        username.matches("[a-zA-Z0-9_.-]{3,60}")
            && password.length() >= 12
            && Set.of("ADMIN", "EDITOR").contains(in.role()),
        "Tên đăng nhập hoặc mật khẩu/quyền chưa hợp lệ");
    Errors.require(
        s.db.queryForObject("select count(*) from staff where username=?", Integer.class, username)
            == 0,
        "Tên đăng nhập đã tồn tại");
    String id = UUID.randomUUID().toString();
    s.db.update(
        "insert into staff values(?,?,?,?,?,?)",
        id,
        username,
        auth.passwords.encode(password),
        name,
        in.role(),
        in.enabled());
    return Map.of("id", id);
  }

  @PutMapping("/admin/staff/{id}")
  Object editStaff(@PathVariable String id, @RequestBody StaffInput in) {
    Actor a = Auth.actor();
    Errors.forbidden(a.role().equals("ADMIN"));
    Errors.require(!a.id().equals(id), "Không thay đổi quyền hoặc khóa tài khoản đang dùng");
    Errors.require(Set.of("ADMIN", "EDITOR").contains(in.role()), "Quyền không hợp lệ");
    s.db.update(
        "update staff set name=?,role=?,enabled=? where id=?",
        Errors.text(in.name(), 80),
        in.role(),
        in.enabled(),
        id);
    s.db.update("delete from sessions where actor_id=?", id);
    return Map.of("ok", true);
  }
}
