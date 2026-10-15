package vn.vju.quiz;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.*;
import vn.vju.quiz.Domain.*;

class CacheSafetyTest {
  @Test
  void concurrentCatalogLoadsShareOnlyPublicSummaryAndInvalidate() throws Exception {
    Store s = mock(Store.class);
    Chapter c = new Chapter();
    c.status = "PUBLISHED";
    Question q = new Question();
    q.chapterId = c.id;
    q.status = "PUBLISHED";
    q.explanation = "SECRET";
    when(s.all("chapters", Chapter.class)).thenReturn(List.of(c));
    when(s.all("questions", Question.class)).thenReturn(List.of(q));
    when(s.all("quizzes", Quiz.class)).thenReturn(List.of());
    var service = new ContentService(s);
    try (var executor = Executors.newFixedThreadPool(20)) {
      var tasks = new ArrayList<Callable<Map<String, Object>>>();
      for (int i = 0; i < 100; i++) tasks.add(service::catalog);
      for (var result : executor.invokeAll(tasks)) {
        var value = result.get();
        assertFalse(value.toString().contains("SECRET"));
        assertFalse(value.toString().contains("correct"));
        assertThrows(UnsupportedOperationException.class, () -> value.put("x", 1));
      }
    }
    verify(s, times(1)).all("questions", Question.class);
    when(s.contentRevision()).thenReturn(1L);
    c.status = "ARCHIVED";
    assertEquals(List.of(), service.catalog().get("chapters"));
    verify(s, times(2)).all("questions", Question.class);
  }

  @Test
  void contentInvalidatesOnlyAfterCommitAndNotForPrivateWrites() {
    var s = new Store(mock(JdbcTemplate.class), new ObjectMapper());
    TransactionSynchronizationManager.initSynchronization();
    try {
      s.save("questions", "q", Map.of("text", "new"));
      assertEquals(0, s.contentRevision());
      var callbacks = TransactionSynchronizationManager.getSynchronizations();
      callbacks.forEach(TransactionSynchronization::afterCommit);
      assertEquals(1, s.contentRevision());
    } finally {
      TransactionSynchronizationManager.clearSynchronization();
    }
    TransactionSynchronizationManager.initSynchronization();
    try {
      s.save("questions", "q", Map.of("text", "rollback"));
      TransactionSynchronizationManager.getSynchronizations()
          .forEach(x -> x.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK));
      assertEquals(1, s.contentRevision());
    } finally {
      TransactionSynchronizationManager.clearSynchronization();
    }
    s.save("rooms", "123456", Map.of());
    assertEquals(1, s.contentRevision());
  }
}
