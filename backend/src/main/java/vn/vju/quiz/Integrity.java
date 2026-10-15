package vn.vju.quiz;

import java.util.*;

/** Client signals for human review only. They never alter scores. */
public final class Integrity {
  public record Event(String eventId, String kind) {}

  static void record(Map<String, Long> events, Event e) {
    Errors.require(
        e.eventId() != null
            && e.eventId().matches("[a-zA-Z0-9-]{1,64}")
            && Set.of("TAB_HIDDEN", "COPY_BLOCKED").contains(Objects.toString(e.kind(), "")),
        "Sự kiện không hợp lệ");
    if (events.size() < 100)
      events.putIfAbsent(e.kind() + ":" + e.eventId(), System.currentTimeMillis());
  }

  static Map<String, Object> summary(Map<String, Long> events) {
    return Map.of(
        "tabHidden",
        events.keySet().stream().filter(k -> k.startsWith("TAB_HIDDEN:")).count(),
        "copyBlocked",
        events.keySet().stream().filter(k -> k.startsWith("COPY_BLOCKED:")).count(),
        "capped",
        events.size() >= 100);
  }
}
