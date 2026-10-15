package vn.vju.quiz;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.AnonymousAuthenticationFilter;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.stereotype.Service;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.server.ResponseStatusException;
import vn.vju.quiz.Domain.Actor;

@Service
public class Auth {
  final JdbcTemplate db;
  final BCryptPasswordEncoder passwords = new BCryptPasswordEncoder();
  final String origin;
  final boolean secure;
  final Map<String, List<Long>> rates = new ConcurrentHashMap<>();

  public Auth(
      JdbcTemplate db,
      @Value("${app.origin}") String origin,
      @Value("${app.secure-cookie}") boolean secure) {
    this.db = db;
    this.origin = origin;
    this.secure = secure;
  }

  String random() {
    return UUID.randomUUID().toString() + UUID.randomUUID();
  }

  String hash(String s) {
    try {
      return HexFormat.of()
          .formatHex(
              MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)));
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  String token(HttpServletRequest req) {
    if (req.getCookies() != null)
      for (var c : req.getCookies()) if (c.getName().equals("vju_session")) return c.getValue();
    return "";
  }

  Actor resolve(HttpServletRequest req) {
    String t = token(req);
    if (t.isBlank()) return null;
    var rows =
        db.queryForList(
            "select * from sessions where token_hash=? and expires_at>?",
            hash(t),
            System.currentTimeMillis());
    if (rows.isEmpty()) return null;
    var r = rows.getFirst();
    String role = (String) r.get("role"), id = (String) r.get("actor_id");
    if (!role.equals("GUEST")) {
      var staff = db.queryForList("select enabled,role from staff where id=?", id);
      if (staff.isEmpty() || !Boolean.TRUE.equals(staff.getFirst().get("enabled"))) return null;
      role = (String) staff.getFirst().get("role");
    }
    return new Actor(id, (String) r.get("name"), role, (String) r.get("csrf"));
  }

  public static Actor actor() {
    var a = SecurityContextHolder.getContext().getAuthentication();
    if (a == null || !(a.getPrincipal() instanceof Actor))
      throw new ResponseStatusException(
          HttpStatus.UNAUTHORIZED, "Vui lòng nhập tên hoặc đăng nhập");
    return (Actor) a.getPrincipal();
  }

  void cookie(HttpServletResponse res, String token, int days) {
    res.addHeader(
        "Set-Cookie",
        ResponseCookie.from("vju_session", token)
            .httpOnly(true)
            .secure(secure)
            .sameSite("Lax")
            .path("/")
            .maxAge(days * 86400L)
            .build()
            .toString());
  }

  Actor session(HttpServletResponse res, String id, String name, String role) {
    String t = random(), csrf = random();
    db.update(
        "insert into sessions values(?,?,?,?,?,?)",
        hash(t),
        id,
        name,
        role,
        csrf,
        System.currentTimeMillis() + 30L * 86400000);
    cookie(res, t, 30);
    return new Actor(id, name, role, csrf);
  }

  synchronized void limit(String key, int max) {
    long now = System.currentTimeMillis();
    rates.entrySet().removeIf(e -> e.getValue().stream().allMatch(t -> t < now - 60000));
    var hits = rates.computeIfAbsent(key, k -> new ArrayList<>());
    hits.removeIf(t -> t < now - 60000);
    if (hits.size() >= max)
      throw new ResponseStatusException(
          HttpStatus.TOO_MANY_REQUESTS, "Thao tác quá nhanh. Vui lòng thử lại sau một phút.");
    hits.add(now);
  }

  @Configuration
  static class Security {
    @Bean
    SecurityFilterChain chain(HttpSecurity http, Auth auth) throws Exception {
      // Use MVC-compatible parsed paths, including percent-encoded path segments.
      var paths = PathPatternRequestMatcher.withDefaults();
      var api = paths.matcher("/api/**");
      var admin = paths.matcher("/api/admin/**");
      var guestSession = paths.matcher("/api/session");
      var login = paths.matcher("/api/auth/login");
      http.csrf(c -> c.disable())
          .sessionManagement(
              s ->
                  s.sessionCreationPolicy(
                      org.springframework.security.config.http.SessionCreationPolicy.STATELESS))
          .authorizeHttpRequests(a -> a.anyRequest().permitAll());
      http.addFilterBefore(
          new OncePerRequestFilter() {
            protected void doFilterInternal(
                HttpServletRequest req, HttpServletResponse res, FilterChain chain)
                throws java.io.IOException, ServletException {
              Actor actor = auth.resolve(req);
              if (actor != null)
                SecurityContextHolder.getContext()
                    .setAuthentication(
                        new UsernamePasswordAuthenticationToken(
                            actor,
                            null,
                            List.of(new SimpleGrantedAuthority("ROLE_" + actor.role()))));
              boolean write = !Set.of("GET", "HEAD", "OPTIONS").contains(req.getMethod());
              boolean bootstrap = guestSession.matches(req) || login.matches(req);
              String o = req.getHeader("Origin");
              if (write
                  && api.matches(req)
                  && ((o != null && !o.equals(auth.origin))
                      || (bootstrap
                          && (req.getContentType() == null
                              || !req.getContentType().startsWith("application/json")))
                      || (!bootstrap
                          && (actor == null
                              || !MessageDigest.isEqual(
                                  actor.csrf().getBytes(StandardCharsets.UTF_8),
                                  Objects.toString(req.getHeader("X-CSRF-Token"), "")
                                      .getBytes(StandardCharsets.UTF_8)))))) {
                res.setStatus(403);
                res.setContentType("application/json;charset=UTF-8");
                res.getWriter().write("{\"message\":\"Phiên không hợp lệ. Hãy tải lại trang.\"}");
                return;
              }
              if (admin.matches(req) && (actor == null || !actor.staff())) {
                res.setStatus(actor == null ? 401 : 403);
                res.setContentType("application/json;charset=UTF-8");
                res.getWriter().write("{\"message\":\"Cần tài khoản quản lý\"}");
                return;
              }
              chain.doFilter(req, res);
            }
          },
          AnonymousAuthenticationFilter.class);
      return http.build();
    }
  }

  @RestController
  @RequestMapping("/api")
  static class Controller {
    final Auth a;

    Controller(Auth a) {
      this.a = a;
    }

    @GetMapping("/session")
    Map<String, Object> me(HttpServletRequest req) {
      Actor p = a.resolve(req);
      return p == null ? Map.of("authenticated", false) : Map.of("authenticated", true, "actor", p);
    }

    @PostMapping("/session")
    Actor guest(
        @RequestBody Map<String, String> body, HttpServletRequest req, HttpServletResponse res) {
      a.limit("guest:" + req.getRemoteAddr(), 150);
      String name = Errors.text(body.get("name"), 40);
      Actor p = a.resolve(req);
      if (p != null && p.role().equals("GUEST")) {
        a.db.update("update sessions set name=? where token_hash=?", name, a.hash(a.token(req)));
        return new Actor(p.id(), name, p.role(), p.csrf());
      }
      return a.session(res, UUID.randomUUID().toString(), name, "GUEST");
    }

    @PostMapping("/auth/login")
    Actor login(
        @RequestBody Map<String, String> body, HttpServletRequest req, HttpServletResponse res) {
      a.limit("login:" + req.getRemoteAddr(), 10);
      var rows =
          a.db.queryForList(
              "select * from staff where username=? and enabled=true",
              Objects.toString(body.get("username"), ""));
      if (rows.isEmpty()
          || !a.passwords.matches(
              Objects.toString(body.get("password"), ""), (String) rows.getFirst().get("password")))
        throw new ResponseStatusException(
            HttpStatus.UNAUTHORIZED, "Tên đăng nhập hoặc mật khẩu chưa đúng");
      var r = rows.getFirst();
      a.db.update("delete from sessions where token_hash=?", a.hash(a.token(req)));
      return a.session(res, (String) r.get("id"), (String) r.get("name"), (String) r.get("role"));
    }

    @PostMapping("/auth/logout")
    Map<String, Boolean> logout(HttpServletRequest req, HttpServletResponse res) {
      a.db.update("delete from sessions where token_hash=?", a.hash(a.token(req)));
      a.cookie(res, "", 0);
      return Map.of("ok", true);
    }

    @PostMapping("/auth/password")
    Map<String, Boolean> password(@RequestBody Map<String, String> body) {
      Actor p = actor();
      Errors.forbidden(p.staff());
      String old =
          a.db.queryForObject("select password from staff where id=?", String.class, p.id());
      Errors.require(
          a.passwords.matches(body.getOrDefault("current", ""), old),
          "Mật khẩu hiện tại chưa đúng");
      String next = Errors.text(body.get("password"), 100);
      Errors.require(next.length() >= 12, "Mật khẩu cần ít nhất 12 ký tự");
      a.db.update("update staff set password=? where id=?", a.passwords.encode(next), p.id());
      a.db.update("delete from sessions where actor_id=? and csrf<>?", p.id(), p.csrf());
      return Map.of("ok", true);
    }
  }
}
