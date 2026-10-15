package vn.vju.quiz;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import vn.vju.quiz.Domain.*;

@Component
public class DeadlineWorker {
  final Store s;
  final RoomService rooms;
  final PracticeService practice;
  final TransactionTemplate tx;

  DeadlineWorker(Store s, RoomService r, PracticeService p, PlatformTransactionManager t) {
    this.s = s;
    rooms = r;
    practice = p;
    tx = new TransactionTemplate(t);
  }

  @Scheduled(fixedDelay = 500)
  public void expire() {
    long now = System.currentTimeMillis();
    for (String id :
        s.db.queryForList(
            "select id from rooms where data->>'status'='QUESTION' and"
                + " (data->>'deadline')::bigint<=?",
            String.class,
            now)) rooms.tick(id);
    for (String id :
        s.db.queryForList(
            "select id from attempts where data->>'status'='ACTIVE' and"
                + " (data->>'deadline')::bigint>0 and (data->>'deadline')::bigint<=?",
            String.class,
            now))
      tx.executeWithoutResult(
          t -> {
            Attempt a = s.get("attempts", id, Attempt.class, true);
            practice.finish(a, now);
          });
  }

  @Scheduled(fixedDelay = 3600000)
  public void cleanup() {
    s.db.update("delete from sessions where expires_at<?", System.currentTimeMillis());
    s.db.update("delete from allocation_budgets where expires_at<?", System.currentTimeMillis());
  }
}
