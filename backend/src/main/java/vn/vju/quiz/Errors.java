package vn.vju.quiz;

import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
public class Errors {
  @ExceptionHandler(ResponseStatusException.class)
  ResponseEntity<?> known(ResponseStatusException e) {
    return ResponseEntity.status(e.getStatusCode())
        .body(
            java.util.Map.of(
                "message", e.getReason() == null ? "Yêu cầu không hợp lệ" : e.getReason()));
  }

  @ExceptionHandler({
    IllegalArgumentException.class,
    org.springframework.http.converter.HttpMessageNotReadableException.class,
    org.springframework.web.bind.MethodArgumentNotValidException.class
  })
  ResponseEntity<?> invalid(Exception e) {
    return ResponseEntity.badRequest()
        .body(java.util.Map.of("message", "Dữ liệu không hợp lệ. Vui lòng kiểm tra lại."));
  }

  static void require(boolean ok, String message) {
    if (!ok) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
  }

  static void forbidden(boolean ok) {
    if (!ok)
      throw new ResponseStatusException(
          HttpStatus.FORBIDDEN, "Bạn không có quyền thực hiện thao tác này");
  }

  static String text(String s, int max) {
    require(s != null && !s.isBlank() && s.length() <= max, "Nội dung trống hoặc quá dài");
    return s.strip();
  }
}
