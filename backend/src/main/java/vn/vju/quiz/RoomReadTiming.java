package vn.vju.quiz;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/** Opt-in diagnostics: durations only, never cookies, tokens, names or answer contents. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
class RoomReadTiming extends OncePerRequestFilter {
  private static final org.slf4j.Logger log =
      org.slf4j.LoggerFactory.getLogger(RoomReadTiming.class);

  @Value("${app.profile-room-reads:false}")
  private boolean enabled;

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    if (!enabled
        || !request.getMethod().equals("GET")
        || !request.getRequestURI().matches("/api/rooms/[0-9]{6}")) {
      chain.doFilter(request, response);
      return;
    }
    long start = System.nanoTime();
    try {
      chain.doFilter(request, response);
    } finally {
      long elapsed = (System.nanoTime() - start) / 1_000_000;
      if (elapsed >= 100)
        log.info("Room read elapsedMs={} status={}", elapsed, response.getStatus());
    }
  }
}
