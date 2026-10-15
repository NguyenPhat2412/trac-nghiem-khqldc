# Kiến trúc và các quyết định

## Mô hình chạy

Nginx → Next.js (giao diện), Spring Boot (REST `/api` và STOMP `/ws`) → PostgreSQL. Chạy một backend với simple broker; chưa mở rộng ngang.

Nghiệp vụ chia thành ContentService, PracticeService, RoomService, Reports, ExcelService và Auth. Dữ liệu aggregate lưu JSONB ở các bảng riêng; identity nhân sự và phiên lưu dạng cột quan hệ. Flyway quản lý schema; khóa hàng `FOR UPDATE` tuần tự hóa lệnh của cùng một phòng/lượt làm.

## Phiên và quyền

Cookie HttpOnly/SameSite=Lax chứa token ngẫu nhiên, database chỉ giữ hash. CSRF token trả qua `/api/session`, bắt buộc cho lệnh REST và CONNECT STOMP. Origin được kiểm tra. ADMIN/EDITOR kiểm tra lại trạng thái tài khoản mỗi yêu cầu. Thay quyền hoặc khóa tài khoản thu hồi phiên. Sinh viên là actor GUEST, không có tài khoản đăng nhập.

WebSocket chỉ phát thông báo `{roomId, version, serverTime}` sau khi transaction đã commit. Người nhận gọi REST để lấy trạng thái phù hợp quyền. SUBSCRIBE kiểm tra thành viên/chủ trì; cấm SEND đến broker để ngăn giả mạo sự kiện. Cập nhật UI bỏ qua phản hồi có phiên bản cũ; poll 4 giây dự phòng khi mất socket.

## Vòng đời phòng

LOBBY → QUESTION → REVEAL → QUESTION … → FINISHED. Máy chủ đặt deadline; worker mỗi 500 ms đóng câu quá hạn. Khi mọi thành viên chưa bị loại đã trả lời, câu cũng đóng. Chủ trì quyết định mở câu tiếp. Restart đọc trạng thái/deadline từ database và tiếp tục xử lý; không tự chuyển câu khi thiếu chủ trì.

## Chấm điểm

Điểm = round(correct / count × 100, 2). Thứ hạng dựa vào số câu đúng rồi thời gian, đồng hạng nếu bằng cả hai. Lượt tự luyện tính khoảng từ start đến submit/deadline. Phòng cộng thời gian từ mở câu đến nhận đáp án, bỏ trống tính toàn bộ thời lượng. Kết thúc sớm chỉ tính câu đã mở. Bảng tự luyện tách bằng quiz version, mỗi version có cấu hình thời gian riêng.

## Các nhóm API

- `/session`, `/auth/login`, `/auth/logout`, `/auth/password`: nhận diện và phiên.
- `/catalog`, `/attempts`, `/attempts/{id}/answer`, `/attempts/{id}/submit`, `/history`, `/leaderboard/{quizId}`: học tập.
- `/rooms/{code}`, `/rooms/{code}/join`, `/rooms/{code}/answer`: người chơi.
- `/admin/rooms`, `/admin/rooms/{code}/{start|next|lock|kick|finish}`: chủ trì.
- `/admin/chapters`, `/admin/questions`, `/admin/quizzes`: nội dung.
- `/admin/import/{template|preview|commit}`: nhập Excel có giao dịch.
- `/admin/report`, `/admin/report.csv`, `/admin/staff`: báo cáo và nhân sự.

Question snapshot giữ nguyên nội dung/đáp án trong attempt và room, dù ngân hàng được sửa sau đó. Các API làm bài đang mở không trả đáp án đúng/lời giải. Kết quả riêng kiểm tra actor ID; tên không được dùng để cấp quyền.

## Vận hành

`/actuator/health` báo sức khỏe. Dữ liệu chính nằm trên ổ D qua bind mount; không chứa trong image. Bản local bind cổng vào loopback. Bản công khai cần TLS và APP_ORIGIN/SECURE_COOKIE tương ứng. Sao lưu PostgreSQL bằng pg_dump; trước nâng cấp schema, lưu bản sao và kiểm thử khôi phục trên database riêng.
