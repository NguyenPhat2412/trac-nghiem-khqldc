package vn.vju.quiz;

import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;
import vn.vju.quiz.Domain.*;

@Component
public class Seed implements CommandLineRunner {
  final Store s;
  final Auth auth;
  final String password;
  final boolean demo;

  Seed(
      Store s,
      Auth a,
      @Value("${app.admin-password}") String password,
      @Value("${app.seed}") boolean demo) {
    this.s = s;
    auth = a;
    this.password = password;
    this.demo = demo;
  }

  public void run(String... args) {
    if (s.db.queryForObject("select count(*) from staff", Integer.class) == 0) {
      Errors.require(password.length() >= 12, "ADMIN_PASSWORD cần ít nhất 12 ký tự");
      s.db.update(
          "insert into staff values(?,?,?,?,?,true)",
          UUID.randomUUID().toString(),
          "admin",
          auth.passwords.encode(password),
          "Quản trị VJU",
          "ADMIN");
    }
    if (!demo || !s.all("chapters", Chapter.class).isEmpty()) return;
    String[] titles = {"Tổng quan về quản lý", "Chức năng hoạch định", "Tổ chức và lãnh đạo"};
    String[][] texts = {
      {
        "Quản lý hướng đến mục đích chính nào?",
        "Yếu tố nào là nguồn lực của một tổ chức?",
        "Chức năng nào xác định mục tiêu và phương án hành động?",
        "Hiệu quả trong quản lý thường gắn với điều gì?"
      },
      {
        "Bước đầu tiên khi xây dựng kế hoạch là gì?",
        "Mục tiêu SMART cần có đặc điểm nào?",
        "Kế hoạch dự phòng giúp tổ chức làm gì?",
        "Phân tích SWOT xem xét yếu tố nào?"
      },
      {
        "Phân quyền trong tổ chức có ý nghĩa gì?",
        "Lãnh đạo gắn với hoạt động nào?",
        "Giao tiếp hai chiều giúp ích điều gì?",
        "Kiểm soát trong quản lý nhằm mục đích gì?"
      }
    };
    String[][] correct = {
      {
        "Đạt mục tiêu thông qua việc sử dụng nguồn lực",
        "Con người, tài chính và thông tin",
        "Hoạch định",
        "Kết quả đạt được so với nguồn lực đã sử dụng"
      },
      {
        "Xác định mục tiêu cần đạt",
        "Cụ thể và đo lường được",
        "Ứng phó với những thay đổi có thể xảy ra",
        "Điểm mạnh, điểm yếu, cơ hội và thách thức"
      },
      {
        "Giao quyền quyết định phù hợp với trách nhiệm",
        "Định hướng và tạo động lực cho con người",
        "Trao đổi và tiếp nhận phản hồi",
        "So sánh kết quả với mục tiêu để điều chỉnh"
      }
    };
    for (int i = 0; i < 3; i++) {
      Chapter ch = new Chapter();
      ch.title = titles[i];
      ch.description = "Dữ liệu minh họa · Cần đối chiếu giáo trình trước khi sử dụng chính thức.";
      ch.position = i + 1;
      ch.status = "PUBLISHED";
      s.save("chapters", ch.id, ch);
      Quiz quiz = new Quiz();
      quiz.title = titles[i];
      quiz.description = "Bộ câu hỏi minh họa";
      quiz.status = "PUBLISHED";
      quiz.timeLimitSeconds = 240;
      quiz.questionSeconds = 30;
      for (int j = 0; j < 4; j++) {
        Question q = new Question();
        q.chapterId = ch.id;
        q.text = texts[i][j];
        q.options =
            List.of(
                correct[i][j],
                "Chỉ thực hiện công việc theo thói quen",
                "Bỏ qua mục tiêu và nguồn lực",
                "Không cần đánh giá kết quả");
        q.correct = 0;
        q.explanation =
            "Minh họa: " + correct[i][j] + ". Hãy kiểm tra nội dung với giáo trình của môn học.";
        q.status = "PUBLISHED";
        s.save("questions", q.id, q);
        quiz.questions.add(q);
      }
      s.save("quizzes", quiz.id, quiz);
    }
  }
}
