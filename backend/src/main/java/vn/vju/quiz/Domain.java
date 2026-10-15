package vn.vju.quiz;

import java.util.*;

public final class Domain {
  public record Actor(String id, String name, String role, String csrf) {
    @Override
    public String toString() {
      return "Actor[id=" + id + ", role=" + role + "]";
    }

    public boolean staff() {
      return role.equals("ADMIN") || role.equals("EDITOR");
    }
  }

  public static class Chapter {
    public String id = UUID.randomUUID().toString(), title = "", description = "", status = "DRAFT";
    public int position;
  }

  public static class Question {
    public String id = UUID.randomUUID().toString(),
        chapterId = "",
        text = "",
        imageUrl = "",
        explanation = "",
        difficulty = "MEDIUM",
        status = "DRAFT";
    public List<String> options = new ArrayList<>();
    public int correct;
  }

  public static class Quiz {
    public String id = UUID.randomUUID().toString(),
        familyId = id,
        title = "",
        description = "",
        status = "DRAFT";
    public int version = 1, timeLimitSeconds = 600, questionSeconds = 30;
    public boolean shuffle = true;
    public List<Question> questions = new ArrayList<>();
    public long createdAt = System.currentTimeMillis();
  }

  public static class Attempt {
    public String id = UUID.randomUUID().toString(),
        playerId,
        name,
        quizId = "",
        title,
        status = "ACTIVE";
    public long startedAt, deadline, finishedAt, durationMs;
    public int correct;
    public boolean ranked, instantFeedback;
    public Map<String, Long> integrityEvents = new LinkedHashMap<>();
    public List<Question> questions = new ArrayList<>();
    public Map<String, Integer> answers = new HashMap<>();
    public Set<String> flagged = new HashSet<>();
  }

  public static class Member {
    public String id, name;
    public String optionSeed = "";
    public boolean kicked;
    public Map<String, Integer> answers = new HashMap<>();
    public Map<String, Long> times = new HashMap<>();
    public Map<String, List<Integer>> optionOrders = new HashMap<>();
    public Map<String, Long> integrityEvents = new LinkedHashMap<>();
  }

  public static class Room {
    public String id, hostId, title, status = "LOBBY";
    public Quiz quiz;
    public boolean locked, early, shuffleAnswers;
    public int current = -1;
    public long version = 0, openedAt, deadline, createdAt = System.currentTimeMillis(), finishedAt;
    public Map<String, Member> members = new LinkedHashMap<>();
    public Set<String> bannedIds = new HashSet<>();
  }
}
