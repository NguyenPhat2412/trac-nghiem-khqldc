# Báo cáo kiểm thử và bàn giao VJU Quiz

Ngày: 15/10/2026. Bản chạy tại http://localhost:3000; quản trị tại http://localhost:3000/admin.

## Kết quả

| Nhóm | Kết quả thực tế |
|---|---|
| Java unit | 4 test đạt; chấm điểm, đồng hạng, phạt bỏ trống, ẩn đáp án, trung bình thời gian phòng |
| API tích hợp | 34 kiểm tra đạt trên database riêng `vju_quiz_test` |
| Trình duyệt | 2 kịch bản xuyên suốt đạt, gồm sinh viên và chủ trì với hai phiên độc lập |
| TypeScript / production build | Kiểm tra kiểu và build cả hai Docker image thành công |
| WebSocket | 100 kết nối nhận cập nhật; 3 kiểm tra quyền kênh đạt |
| Khởi động lại | Giữ phòng, 100 thành viên, đáp án, xếp hạng và phiên khách |
| Kiểm tra dependency frontend | `pnpm audit --prod`: không có cảnh báo đã biết tại thời điểm chạy |

Kiểm tra API bao gồm trùng tên không trùng danh tính; quyền riêng tư bài làm; CSRF; khách không quản lý nội dung; chấm sau đảo đáp án; nộp lặp không nhân kết quả; lượt tốt nhất và số lượt làm; tự nộp đúng hạn; snapshot bất biến; phiên bản quiz mới; Excel lỗi không nhập dở; biên tập viên không cấp quyền hay điều khiển phòng người khác; khóa/loại khỏi phòng; từ chối câu chưa mở/quá hạn; khóa đáp án đầu tiên; không lộ đáp án sớm; nối lại; hết giờ khi chủ trì vắng; kết thúc sớm; báo cáo đúng phạm vi; CSV; thu hồi phiên nhân sự bị khóa.

Các bài test trình duyệt kiểm tra lựa chọn/đánh dấu được giữ sau tải lại, nộp và xem lời giải, xếp hạng/lịch sử, tạo chương, tải mẫu và xem trước Excel, tạo phòng, tham gia bằng điện thoại, cập nhật trực tiếp, trả lời, chuyển câu và tổng kết. Không ghi nhận lỗi JavaScript trang trong các kịch bản này. Có kiểm tra tràn ngang tại 390 × 844.

Sau đợt kiểm thử tích hợp, đã sửa mẫu số thời gian trả lời trung bình theo câu: lượt tự luyện không có đồng hồ riêng từng câu nên không tham gia trung bình thời gian phòng. Một test hồi quy riêng xác nhận một lượt tự luyện và một lượt phòng 4 giây vẫn cho trung bình phòng 4 giây. Chạy lại 4 unit test và build production đều đạt. API session được kiểm tra lại sau khi khởi động bản cuối. Bộ tải và hai kịch bản trình duyệt không chạy lại sau thay đổi riêng ở phép tính này và nhãn báo cáo.

## Tải 100 người trong một phòng

Môi trường: Mac16,11, ARM64, 12 CPU, RAM 48 GiB, macOS 27.0; Docker Desktop/Engine 29.7.2. Một Spring Boot/Java 21, PostgreSQL 17, Next.js 16.4.0 và Nginx chạy Docker trên cùng máy. Client tạo tải cũng chạy cùng máy qua loopback. Không mô phỏng độ trễ Internet.

| Phép đo | p50 | p95 | Lớn nhất |
|---|---:|---:|---:|
| 100 yêu cầu đáp án HTTP đồng thời | 145,95 ms | 233,56 ms | 241,26 ms |
| 100 đáp án với 100 kết nối STOMP đang mở | 244 ms | 402 ms | 423 ms |

100/100 đáp án được lưu. Cập nhật mở câu đến đủ 100 subscriber trong 29 ms. Kết nối ngoài phòng không được subscribe, client không được giả mạo sự kiện bằng SEND, CONNECT sai CSRF bị từ chối. Sau restart, 100 thành viên và đáp án vẫn còn.

Đây là phép đo một đợt trả lời đồng thời trên máy hiện tại, không phải cam kết năng lực cho máy chủ khác hoặc kiểm thử tải kéo dài. Khi đưa lên máy chủ thật cần đo lại qua mạng thực tế.

## Đối chiếu giao diện

Đã xem trực tiếp trong trình duyệt tích hợp và kiểm thử lặp bằng Playwright/Chrome. Ảnh desktop ở viewport 1505 × 1045; ảnh toàn trang có thể cao hơn viewport. Điện thoại ở 390 × 844.

| Tiêu chí | Quan sát |
|---|---|
| Bố cục | Thanh đầu trang, khối giới thiệu và hộp bắt đầu, thư viện chương bên dưới có thứ bậc rõ |
| Màu | Xanh #16803C cho thao tác chính; đỏ #D62828 làm điểm nhấn; nền sáng |
| Chữ | Be Vietnam Pro phục vụ cục bộ, dấu tiếng Việt rõ, tiêu đề và mô tả phân cấp |
| Làm bài | Thẻ đáp án lớn, tiến độ và đồng hồ rõ, trạng thái đã lưu/đánh dấu có chữ |
| Điện thoại | Khối nội dung xuống một cột; các lựa chọn và nút nộp không bị cắt ngang |
| Phòng chơi | Mã/QR, danh sách người chơi, đồng hồ, chọn đáp án và tổng kết được kiểm tra với hai phiên |
| Quản trị | Điều hướng bên trái, biểu mẫu và bảng số liệu cùng ngôn ngữ thiết kế |

Khác biệt có chủ đích so với ảnh ý tưởng: hiển thị số câu thật (4 câu/chương mẫu), dùng một ô mã phòng có nhãn và giới hạn 6 số thay vì 6 ô trang trí, thêm danh sách quiz đã xuất bản để truy cập chế độ có xếp hạng, dùng font có dấu tiếng Việt phục vụ cục bộ. Giao diện được xây từ thành phần web; ảnh ý tưởng không được dùng làm ảnh nền giao diện.

Ảnh bằng chứng trong gói bàn giao: `screenshots/desktop-home.png`, `desktop-practice.png`, `desktop-result.png`, `mobile-home.png`, `mobile-practice.png`, `admin-dashboard.png`, `room-lobby.png`, `mobile-live.png`, `room-result.png`. Kết quả JSON và log đã chọn nằm ở `evidence/`. Các ảnh ghi nhận trạng thái trong lần kiểm thử, có tên và nội dung minh họa.

## Phạm vi bàn giao và giới hạn

Đã có tự luyện, phòng nhiều người, quản lý nội dung/Excel, phân quyền, xếp hạng, thống kê/CSV, Docker Compose, script chạy và sao lưu. Database chính giữ trên ổ D. Bản mã nguồn không chứa mật khẩu, phiên đăng nhập hay database. File tài khoản quản trị bàn giao riêng tại máy này, chỉ chủ sở hữu đọc/ghi.

Học liệu gồm 3 chương, 12 câu minh họa; cần nhập giáo trình thật trước khi dùng chính thức. Tên là tự khai, danh tính theo cookie trình duyệt. Màu chưa được xác nhận là mã nhận diện chính thức VJU. Bản hiện tại chạy một backend và tối đa 100 người/phòng. Chưa triển khai tên miền công khai; localhost chỉ truy cập từ máy này. Hướng dẫn cấu hình HTTPS, origin, cookie và sao lưu nằm trong README.

Kiểm thử tự động tập trung Chrome và kích thước điện thoại giả lập; chưa chứng nhận trên Safari/Firefox hoặc điện thoại vật lý. Kiểm tra dependency frontend không thay thế một cuộc kiểm toán bảo mật toàn diện.
