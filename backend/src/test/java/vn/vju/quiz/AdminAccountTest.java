package vn.vju.quiz;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import vn.vju.quiz.Domain.*;

class AdminAccountTest {
  @Test
  void seedCreatesConfiguredEmailAdminWithNineCharacterPasswordOnEmptyStaffTable() {
    JdbcTemplate db = mock(JdbcTemplate.class);
    Store store = new Store(db, new ObjectMapper());
    Auth auth = new Auth(db, "http://localhost:3000", false);
    when(db.queryForObject(
            "select count(*) from staff where username=?", Integer.class, "admin123@gmail.com"))
        .thenReturn(0);
    when(db.queryForList(
            "select id from staff where username='admin' and role='ADMIN'", String.class))
        .thenReturn(List.of());

    var seed = new Seed(store, auth, "admin123@gmail.com", "Admin123@", false);
    seed.run();

    var hashCaptor = ArgumentCaptor.forClass(String.class);
    verify(db)
        .update(
            eq("insert into staff values(?,?,?,?,?,true)"),
            anyString(),
            eq("admin123@gmail.com"),
            hashCaptor.capture(),
            eq("Quản trị VJU"),
            eq("ADMIN"));
    assertTrue(auth.passwords.matches("Admin123@", hashCaptor.getValue()));
  }

  @Test
  void seedMigratesLegacyDefaultAdminAccountWhenConfiguredAdminDoesNotExistYet() {
    JdbcTemplate db = mock(JdbcTemplate.class);
    Store store = new Store(db, new ObjectMapper());
    Auth auth = new Auth(db, "http://localhost:3000", false);
    when(db.queryForObject(
            "select count(*) from staff where username=?", Integer.class, "admin123@gmail.com"))
        .thenReturn(0);
    when(db.queryForList(
            "select id from staff where username='admin' and role='ADMIN'", String.class))
        .thenReturn(List.of("legacy-admin-id"));

    var seed = new Seed(store, auth, "admin123@gmail.com", "Admin123@", false);
    seed.run();

    var hashCaptor = ArgumentCaptor.forClass(String.class);
    verify(db)
        .update(
            eq("update staff set username=?,password=?,role='ADMIN',enabled=true where id=?"),
            eq("admin123@gmail.com"),
            hashCaptor.capture(),
            eq("legacy-admin-id"));
    verify(db).update("delete from sessions where actor_id=?", "legacy-admin-id");
    assertTrue(auth.passwords.matches("Admin123@", hashCaptor.getValue()));
  }

  @Test
  void seedPreservesExistingConfiguredAdminAndRejectsShortBootstrapPasswords() {
    JdbcTemplate db = mock(JdbcTemplate.class);
    Store store = new Store(db, new ObjectMapper());
    Auth auth = new Auth(db, "http://localhost:3000", false);
    when(db.queryForObject(
            "select count(*) from staff where username=?", Integer.class, "admin123@gmail.com"))
        .thenReturn(1);

    new Seed(store, auth, "admin123@gmail.com", "Admin123@", false).run();
    verify(db, never()).update(anyString(), any(Object[].class));

    assertThrows(
        RuntimeException.class,
        () -> new Seed(store, auth, "admin123@gmail.com", "Short1@", false).run());
  }

  @Test
  void loginAuthenticatesEmailAdminWithConfiguredPassword() {
    JdbcTemplate db = mock(JdbcTemplate.class);
    Auth auth = new Auth(db, "http://localhost:3000", false);
    var controller = new Auth.Controller(auth);
    String encoded = auth.passwords.encode("Admin123@");
    when(db.queryForList(
            "select * from staff where username=? and enabled=true", "admin123@gmail.com"))
        .thenReturn(
            List.of(
                Map.of(
                    "id", "admin-id",
                    "username", "admin123@gmail.com",
                    "password", encoded,
                    "name", "Quản trị VJU",
                    "role", "ADMIN",
                    "enabled", true)));

    var req = new MockHttpServletRequest("POST", "/api/auth/login");
    var res = new MockHttpServletResponse();
    Actor actor =
        controller.login(
            Map.of("username", " admin123@gmail.com ", "password", "Admin123@"), req, res);
    assertEquals("admin-id", actor.id());
    assertEquals("ADMIN", actor.role());
    assertTrue(Objects.toString(res.getHeader("Set-Cookie"), "").contains("vju_session="));
  }

  @Test
  void addStaffAcceptsEmailUsernameAndNineCharPasswordAndRejectsShortPasswords() {
    JdbcTemplate db = mock(JdbcTemplate.class);
    Store store = new Store(db, new ObjectMapper());
    Auth auth = new Auth(db, "http://localhost:3000", false);
    var api = new Api(store, null, null, null, null, null, auth, null);
    Actor admin = new Actor("admin-id", "Quản trị VJU", "ADMIN", "csrf");
    SecurityContextHolder.getContext()
        .setAuthentication(
            new UsernamePasswordAuthenticationToken(
                admin, null, List.of(new SimpleGrantedAuthority("ROLE_ADMIN"))));
    try {
      when(db.queryForObject(
              "select count(*) from staff where username=?", Integer.class, "admin123@gmail.com"))
          .thenReturn(0);
      var res =
          api.addStaff(
              new Api.StaffInput("admin123@gmail.com", "Admin Email", "Admin123@", "ADMIN", true));
      assertNotNull(((Map<?, ?>) res).get("id"));

      assertThrows(
          RuntimeException.class,
          () ->
              api.addStaff(
                  new Api.StaffInput("short@gmail.com", "Short Pass", "Abc123@", "EDITOR", true)));
    } finally {
      SecurityContextHolder.clearContext();
    }
  }

  @Test
  void changePasswordAcceptsNineCharPasswordAndRejectsUnderEightChars() {
    JdbcTemplate db = mock(JdbcTemplate.class);
    Auth auth = new Auth(db, "http://localhost:3000", false);
    var controller = new Auth.Controller(auth);
    Actor admin = new Actor("admin-id", "Quản trị VJU", "ADMIN", "csrf");
    SecurityContextHolder.getContext()
        .setAuthentication(
            new UsernamePasswordAuthenticationToken(
                admin, null, List.of(new SimpleGrantedAuthority("ROLE_ADMIN"))));
    try {
      String oldHash = auth.passwords.encode("OldPassword123@");
      when(db.queryForObject("select password from staff where id=?", String.class, "admin-id"))
          .thenReturn(oldHash);
      var ok = controller.password(Map.of("current", "OldPassword123@", "password", "Admin123@"));
      assertEquals(Map.of("ok", true), ok);

      assertThrows(
          RuntimeException.class,
          () -> controller.password(Map.of("current", "OldPassword123@", "password", "Short1@")));
    } finally {
      SecurityContextHolder.clearContext();
    }
  }
}
