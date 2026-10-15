# VJU Quiz

Website tiếng Việt để ôn tập Khoa học quản lý đại cương và chơi quiz đồng bộ theo lớp. Sinh viên chỉ nhập tên; người quản lý đăng nhập để biên soạn nội dung và chủ trì phòng.

## Chạy bằng Docker

Yêu cầu Docker Desktop/Engine có Docker Compose. Tại thư mục dự án:

```sh
./scripts/start.sh
```

- Website: http://localhost:3000
- Quản trị: http://localhost:3000/admin
- Tài khoản ban đầu: `admin`. Mật khẩu được tạo riêng trong `.env`, trường `ADMIN_PASSWORD`.
- `ADMIN_PASSWORD` chỉ được dùng khi cơ sở dữ liệu chưa có nhân sự. Sau đó đổi mật khẩu trong giao diện Quản trị → Đổi mật khẩu.
- Dừng: `docker compose stop`. Chạy lại: `docker compose up -d`.
- Dữ liệu PostgreSQL nằm trong `data/postgres/` của dự án trên ổ D. Không cần đăng ký dịch vụ ngoài.
- Chạy `./scripts/backup.sh` để tạo bản sao vào `backups/`.

Bản local chỉ mở cổng trên `127.0.0.1`. Thiết bị khác chưa truy cập được bằng địa chỉ localhost của máy này.

## Tính năng

- Nhập tên và nhận mã người chơi qua cookie HttpOnly; không có đăng ký sinh viên.
- Chương, ngân hàng câu hỏi, độ khó, hình ảnh bằng liên kết HTTPS, lời giải; nháp/xuất bản/lưu trữ.
- Bộ quiz có phiên bản và danh sách câu hỏi cố định; sửa bản đã xuất bản tạo bản mới. Lưu nháp bản mới giữ bản đang công khai; xuất bản bản mới lưu trữ bản cũ.
- Tự luyện bộ quiz hoặc chọn chương/số câu/thời gian; đảo câu và đáp án; đánh dấu, tự lưu, tiếp tục sau tải lại, tự nộp khi hết giờ.
- Kết quả, lời giải, lịch sử tự luyện, luyện lại câu sai, bảng xếp hạng theo phiên bản quiz.
- Phòng 6 số, liên kết/QR, phòng chờ, khóa/loại người chơi, chủ trì mở từng câu, khóa lựa chọn, đóng câu khi hết giờ hoặc mọi người trả lời.
- Xếp hạng sau từng câu, phân bố lựa chọn, top 3, kết thúc sớm và báo cáo chi tiết; khôi phục sau mất mạng và khởi động lại backend.
- Nhập Excel có mẫu, xem trước, chỉnh sửa lỗi theo dòng, giao dịch nhập toàn bộ hoặc không nhập.
- Báo cáo theo ngày/chương/quiz/phòng; xuất CSV; nhân sự ADMIN/EDITOR và khóa tài khoản.

## Học liệu

Có 3 chương và 12 câu **minh họa**, không phải ngân hàng câu hỏi chính thức của VJU. Dùng trang quản trị hoặc mẫu Excel để thay nội dung bằng giáo trình thật. Màu xanh/đỏ và chữ VJU được dùng theo yêu cầu thiết kế; chưa xác nhận là bộ nhận diện chính thức.

## Công nghệ

- Next.js 16.4.0, React, TypeScript, Be Vietnam Pro tự phục vụ từ gói font.
- Java 21, Spring Boot 3.5.16, Spring Security, JDBC, Flyway.
- PostgreSQL 17, dữ liệu nghiệp vụ JSONB theo aggregate; transaction và khóa hàng cho lượt làm/phòng.
- REST cho lệnh có xác thực; STOMP/WebSocket phát sự kiện đổi phiên bản phòng. Client tải trạng thái đã lọc theo quyền. Cách này không phát đáp án riêng hay khóa chấm điểm vào kênh chung.
- Nginx phục vụ cùng một origin cho frontend, REST và WebSocket. Không cần Redis cho một backend.

## Phát triển

Backend: Java 21 và Maven 3.9+; nạp biến `.env`, chạy `mvn -f backend/pom.xml spring-boot:run`. Database mặc định ở localhost:55432.

Frontend: Node 24 và pnpm 11.25; `cd frontend && pnpm install --frozen-lockfile && pnpm dev`. Nếu chạy trực tiếp không qua Nginx, đặt `NEXT_PUBLIC_WS_URL=ws://localhost:8080/ws` khi chạy frontend; `APP_ORIGIN` của backend phải khớp origin frontend.

Một số Node được đóng gói trong ứng dụng macOS không nạp được thư viện native của Next. Bản Docker đã được build và kiểm thử; dùng Node chính thức hoặc Docker trong trường hợp đó.

## Kiểm thử

- Unit: `mvn -f backend/pom.xml test`.
- Kiểm tra TypeScript: `cd frontend && pnpm typecheck`.
- API, phân quyền và tải 100 người: `./scripts/test-integration.sh` (chỉ xóa/tạo lại database **vju_quiz_test**).
- Trình duyệt: nạp `.env`, `cd frontend && pnpm exec playwright test`. Cấu hình dùng Chrome; cài Google Chrome hoặc đổi channel theo môi trường. Các bài test tạo dữ liệu minh họa trong bản local.
- WebSocket: sau khi test-backend sẵn sàng, nạp `.env`, `cd frontend && node tests/realtime-check.mjs`. Tránh chạy liên tục vượt 150 phiên khách/phút trên cùng IP.
- Phục hồi: sau WebSocket test, `docker compose --profile test restart test-backend`, chờ health sẵn sàng, rồi `cd frontend && node tests/restart-check.mjs`.
- Kết quả và ảnh chụp ở `work/`; hướng dẫn và báo cáo bàn giao trong `docs/`.

## Đưa lên máy chủ

Dùng một máy chủ chạy Docker, trỏ tên miền, đặt HTTPS reverse proxy phía trước cổng local 3000. Đổi `APP_ORIGIN=https://ten-mien-cua-ban`, `SECURE_COOKIE=true`, và `SEED_DEMO=false` trước lần tạo database chính thức. Giữ chuyển tiếp WebSocket Upgrade và cùng origin cho `/api` và `/ws`. Không công khai cổng PostgreSQL. Khởi động lại backend khi thay origin/cookie.

Sau triển khai, kiểm tra health, đăng nhập quản trị, tạo phòng và tham gia bằng một thiết bị khác. Chưa triển khai tên miền công khai trong lần bàn giao này.

## Giới hạn đã chọn

Tên là tự khai; mã người chơi thuộc trình duyệt, không xác thực sinh viên. Xóa cookie hoặc đổi thiết bị tạo người chơi mới. Đây là hệ thống ôn tập, không thay thế cơ chế định danh/giám sát kỳ thi. Các lượt làm và dữ liệu phòng được giữ lại; quản trị viên quản lý sao lưu và thời gian lưu trữ theo nhu cầu. Tối đa 100 người/phòng, 100 câu/quiz; một backend cho môi trường hiện tại.
