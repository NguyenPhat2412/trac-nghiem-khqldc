package vn.vju.quiz;

import java.io.*;
import java.util.*;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import vn.vju.quiz.Domain.*;

@Service
public class ExcelService {
  final ContentService content;
  final Store s;

  ExcelService(ContentService c, Store s) {
    content = c;
    this.s = s;
  }

  public byte[] template() throws IOException {
    try (var w = new XSSFWorkbook();
        var out = new ByteArrayOutputStream()) {
      var sh = w.createSheet("Cau hoi");
      String[] labels = {
        "chapterId",
        "question",
        "A",
        "B",
        "C",
        "D",
        "correct",
        "explanation",
        "difficulty",
        "imageUrl",
        "status"
      };
      var row = sh.createRow(0);
      for (int i = 0; i < labels.length; i++) {
        row.createCell(i).setCellValue(labels[i]);
        sh.setColumnWidth(i, 6000);
      }
      var qs = s.all("questions", Question.class);
      if (!qs.isEmpty()) {
        var q = qs.getFirst();
        String[] values = {
          q.chapterId,
          "[MINH HỌA] " + q.text,
          q.options.get(0),
          q.options.get(1),
          q.options.get(2),
          q.options.get(3),
          String.valueOf((char) ('A' + q.correct)),
          q.explanation,
          q.difficulty,
          "",
          "DRAFT"
        };
        var r = sh.createRow(1);
        for (int i = 0; i < values.length; i++) r.createCell(i).setCellValue(values[i]);
      }
      w.write(out);
      return out.toByteArray();
    }
  }

  public List<Map<String, Object>> preview(InputStream stream) throws IOException {
    try (var w = new XSSFWorkbook(stream)) {
      Errors.require(w.getNumberOfSheets() > 0, "Tệp không có trang dữ liệu");
      var sh = w.getSheetAt(0);
      Errors.require(sh.getLastRowNum() <= 1000, "Mỗi lần nhập tối đa 1.000 câu");
      var result = new ArrayList<Map<String, Object>>();
      DataFormatter f = new DataFormatter();
      for (int i = 1; i <= sh.getLastRowNum(); i++) {
        Row row = sh.getRow(i);
        if (row == null) continue;
        String[] v = new String[11];
        for (int j = 0; j < 11; j++) {
          Cell cell = row.getCell(j);
          v[j] =
              cell != null && cell.getCellType() != CellType.FORMULA
                  ? f.formatCellValue(cell).strip()
                  : "";
        }
        if (Arrays.stream(v).allMatch(String::isBlank)) continue;
        Question q = new Question();
        q.chapterId = v[0];
        q.text = v[1];
        q.options = List.of(v[2], v[3], v[4], v[5]);
        q.correct = v[6].length() == 1 ? v[6].toUpperCase().charAt(0) - 'A' : -1;
        q.explanation = v[7];
        q.difficulty = v[8].isBlank() ? "MEDIUM" : v[8];
        q.imageUrl = v[9];
        q.status = v[10].isBlank() ? "DRAFT" : v[10];
        String error = "";
        try {
          content.validate(q);
        } catch (Exception e) {
          error =
              e instanceof org.springframework.web.server.ResponseStatusException x
                  ? Objects.toString(x.getReason(), "Dữ liệu sai")
                  : "Dữ liệu sai";
        }
        result.add(Map.of("row", i + 1, "question", q, "error", error));
      }
      return result;
    }
  }

  @Transactional
  public Map<String, Integer> commit(List<Question> rows) {
    Errors.require(!rows.isEmpty() && rows.size() <= 1000, "Cần từ 1 đến 1.000 câu");
    rows.forEach(content::validate);
    for (Question q : rows) {
      q.id = UUID.randomUUID().toString();
      s.save("questions", q.id, q);
    }
    return Map.of("imported", rows.size());
  }
}
