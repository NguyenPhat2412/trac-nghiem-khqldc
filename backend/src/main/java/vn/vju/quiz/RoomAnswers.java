package vn.vju.quiz;

import jakarta.annotation.PreDestroy;
import java.util.*;
import java.util.concurrent.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import vn.vju.quiz.Domain.Actor;

/** Bounded, short-lived work queue, never an authoritative cache or an early acknowledgement. */
@Service
public class RoomAnswers {
  private final RoomService rooms;
  private final ScheduledExecutorService workers;
  private final Map<String, Lane> lanes = new HashMap<>();
  private int outstanding;
  private boolean stopped;

  private static class Pending {
    final RoomService.AnswerCommand command;
    final CompletableFuture<Map<String, Object>> result = new CompletableFuture<>();
    int responses = 1;

    Pending(RoomService.AnswerCommand command) {
      this.command = command;
    }
  }

  private static class Lane {
    final Map<String, Pending> actors = new HashMap<>();
    final List<Pending> waiting = new ArrayList<>();
  }

  public RoomAnswers(RoomService rooms) {
    this.rooms = rooms;
    this.workers =
        Executors.newScheduledThreadPool(
            4,
            r -> {
              Thread t = new Thread(r, "quiz-answer-batch");
              t.setDaemon(true);
              return t;
            });
  }

  public synchronized CompletableFuture<Map<String, Object>> submit(
      Actor actor, String code, String questionId, int choice) {
    Errors.require(code.matches("[0-9]{6}"), "Mã phòng không hợp lệ");
    Errors.require(
        questionId != null && questionId.length() <= 100 && choice >= 0 && choice < 4,
        "Câu hỏi hoặc đáp án không hợp lệ");
    Lane lane = lanes.get(code);
    Pending existing = lane == null ? null : lane.actors.get(actor.id());
    if (existing != null) {
      Errors.require(
          existing.command.questionId().equals(questionId), "Đang lưu câu trả lời trước");
      if (existing.responses >= 32)
        throw new ResponseStatusException(
            HttpStatus.TOO_MANY_REQUESTS, "Đang lưu câu trả lời. Vui lòng chờ kết quả.");
      existing.responses++;
      // Repeated clicks share the first submitted choice and cannot consume queue slots.
      return existing.result.copy();
    }
    if (stopped
        || outstanding >= 1024
        || (lane == null && lanes.size() >= 128)
        || (lane != null && lane.actors.size() >= 100))
      throw new ResponseStatusException(
          HttpStatus.TOO_MANY_REQUESTS, "Hệ thống đang bận. Vui lòng gửi lại câu trả lời.");
    boolean schedule = lane == null;
    if (schedule) {
      lane = new Lane();
      lanes.put(code, lane);
    }
    var pending =
        new Pending(
            new RoomService.AnswerCommand(actor, questionId, choice, System.currentTimeMillis()));
    lane.actors.put(actor.id(), pending);
    lane.waiting.add(pending);
    outstanding++;
    if (schedule) workers.schedule(() -> flush(code), 10, TimeUnit.MILLISECONDS);
    // Cancelling an HTTP response must not cancel durable work or other retry responses.
    return pending.result.copy();
  }

  private void flush(String code) {
    List<Pending> batch;
    synchronized (this) {
      Lane lane = lanes.get(code);
      if (lane == null) return;
      batch = List.copyOf(lane.waiting);
      lane.waiting.clear();
    }
    try {
      // This call goes through Spring's transactional proxy. Completion is AFTER commit.
      var results = rooms.answerBatch(code, batch.stream().map(p -> p.command).toList());
      for (int i = 0; i < batch.size(); i++) {
        var result = results.get(i);
        if (result.failure() == null) batch.get(i).result.complete(result.value());
        else batch.get(i).result.completeExceptionally(result.failure());
      }
    } catch (RuntimeException failure) {
      batch.forEach(p -> p.result.completeExceptionally(failure));
    } finally {
      synchronized (this) {
        Lane lane = lanes.get(code);
        for (Pending p : batch) lane.actors.remove(p.command.actor().id());
        outstanding -= batch.size();
        if (lane.waiting.isEmpty()) lanes.remove(code);
        else workers.schedule(() -> flush(code), 10, TimeUnit.MILLISECONDS);
      }
    }
  }

  @PreDestroy
  synchronized void close() {
    stopped = true;
    workers.shutdownNow();
    var failure =
        new ResponseStatusException(
            HttpStatus.SERVICE_UNAVAILABLE,
            "Máy chủ đang khởi động lại. Vui lòng kết nối lại để kiểm tra câu trả lời.");
    lanes
        .values()
        .forEach(
            lane -> lane.actors.values().forEach(p -> p.result.completeExceptionally(failure)));
  }
}
