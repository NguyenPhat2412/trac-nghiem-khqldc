# Cập nhật trải nghiệm chơi và hỗ trợ làm bài công bằng

Ngày 15/10/2026. Mục tiêu: giao diện gần với trải nghiệm game quiz, giữ xanh–đỏ VJU, phản hồi rõ ràng, hiệu ứng có kiểm soát và tăng biện pháp hạn chế gian lận trong phạm vi ứng dụng web ôn tập.

## Những gì đã thay đổi

- Trang chủ có số liệu thật về chương/câu/quiz, thư viện chương gọn hơn, trạng thái chọn chương rõ và thông báo khi tìm kiếm không có kết quả. Thẻ quiz, phòng chờ và thẻ người chơi có màu nền, độ nổi và khoảng cách nhất quán.
- Màn trả lời có bốn thẻ lớn, hiệu ứng nhấn, chuyển câu, trạng thái đúng/sai bằng màu, chữ và biểu tượng. Đồng hồ có thanh thời gian còn lại; tiến độ bài/phòng có nhãn cho công cụ hỗ trợ. Không thêm thời gian trì hoãn hoặc tự chuyển câu khi người học đang đọc lời giải.
- Kết quả có đúng/sai/bỏ trống, hiệu ứng giấy màu ngắn và bục xếp hạng. Điểm và thứ hạng vẫn do máy chủ quyết định.
- Thanh trải nghiệm: âm thanh mặc định tắt; chỉ phát giai điệu ngắn khi bật. Có nút hiệu ứng và phím 1–4, lưu lựa chọn trên trình duyệt. Phím tắt mặc định tắt và không hoạt động trong ô nhập hoặc hộp xác nhận. Khi câu đã khóa, phím không sửa được đáp án.
- Hiệu ứng tôn trọng cài đặt giảm chuyển động của hệ điều hành; không nhấp nháy liên tục. Toàn màn hình là tùy chọn, có nút thoát và giữ lối thoát của trình duyệt. Trình duyệt không hỗ trợ vẫn làm bài bình thường.
- Hộp xác nhận nộp/kết thúc dùng dialog có tên, giới hạn vòng Tab trong hộp, Escape để quay lại khi chưa gửi. Có liên kết bỏ qua điều hướng và trạng thái trang hiện tại.
- Khi mất mạng, thông báo rõ và không nhận thao tác chọn đáp án mới. Khi có mạng hoặc quay lại trang, tải trạng thái máy chủ. Không báo lưu thành công khi yêu cầu lưu thất bại; có nút đồng bộ lại. Phản hồi đọc trạng thái đến trễ không được ghi đè lựa chọn mới hơn hoặc kéo bài đã hoàn thành về trạng thái đang làm.

## Hạn chế sao chép và ghi nhận tập trung

Giữ các biện pháp đã có: cookie HttpOnly, CSRF, quyền bài/phòng/báo cáo, đáp án đúng chỉ mở đúng thời điểm, chấm và hạn giờ ở máy chủ, khóa lần trả lời đầu ở phòng/chế độ học, đảo A–D theo từng người, snapshot lịch sử và giới hạn tần suất.

Bổ sung:

- Tạm ẩn vùng câu hỏi khi trang bị ẩn và hiện lại khi trở về. Đây là hạn chế hiển thị, không phải bảo vệ tuyệt đối chống chụp ảnh.
- Ghi nhận thoát toàn màn hình trong lúc câu/bài được bảo vệ, bên cạnh rời trang và thao tác sao chép bị chặn. Yêu cầu ghi nhận khi rời trang dùng `keepalive`; việc trình duyệt đóng, mất mạng hoặc can thiệp vẫn có thể khiến thiếu sự kiện.
- Thông báo cho người học, có nút “Đã hiểu”; không tự trừ điểm, không tự loại người chơi. Chủ trì và quản trị xem số lượng theo quyền; không công khai trên bảng xếp hạng.
- Xuất CSV kết quả kèm số lần rời trang, thao tác sao chép, thoát toàn màn hình và cờ đạt giới hạn ghi nhận. Tối đa 100 sự kiện/bài hoặc thành viên phòng; dữ liệu cũ thiếu trường mới được xem là 0.

Thoát toàn màn hình hoặc chuyển tab **không chứng minh gian lận**. Website không thể ngăn tuyệt đối chụp màn hình, thiết bị thứ hai, nhờ người khác hay trình duyệt bị can thiệp. Không dùng webcam, đọc ứng dụng khác, chặn phím hệ điều hành hay ép chế độ kiosk. Ngân hàng đang công khai để học nên bảng xếp hạng không đại diện một kỳ thi có xác thực danh tính.

Tham khảo: [Fullscreen API](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen) yêu cầu tương tác của người dùng và phụ thuộc hỗ trợ trình duyệt; [Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API) cung cấp tín hiệu trang bị ẩn, không xác định hành động tra cứu đáp án.

## Đối chiếu hoàn thành

| Yêu cầu | Bằng chứng |
|---|---|
| Giao diện chơi quiz, màu VJU, điện thoại/desktop | Xem trực tiếp trang chủ, bài học, kết quả ở trình duyệt; ảnh `ux-home-desktop.png`, `ux-play-desktop.png`, `ux-result-mobile.png`, `game-controls-mobile.png`; kiểm tra 390 px không tràn ngang |
| Hiệu ứng đúng/sai, chuyển câu, kết quả | CSS trạng thái và component Feedback/Celebration; kịch bản học từng câu, phòng chơi và ảnh phản hồi |
| Âm thanh tùy chọn, hiệu ứng giảm chuyển động | Test không tạo âm thanh khi mặc định tắt; bật tạo oscillator thực; lưu tùy chọn; CSS animation/transition tắt khi chọn hoặc hệ điều hành yêu cầu |
| Bàn phím, hộp xác nhận | Phím 1 chọn đúng nút; không trả lời khi dialog mở; vòng Tab, Escape và khóa đáp án được kiểm tra |
| Mất mạng và phản hồi trễ | Test offline/online, lỗi lưu 503 và trì hoãn phản hồi phục hồi; lựa chọn mới giữ đúng ở giao diện và máy chủ |
| Hạn chế copy, ẩn trang, toàn màn hình | Test copy notice; vào/thoát fullscreen thật trên Chrome; tín hiệu trả 200. Visibility được mô phỏng ở test handler để kiểm tra ẩn/hiện và gửi sự kiện, không coi là bằng chứng phát hiện gian lận thực tế |
| Tín hiệu lưu đúng, đúng quyền, không phạt | Unit/real API: gộp sự kiện trùng, đầy giới hạn, mới/cũ, chỉ chủ trì nhận; người có tín hiệu vẫn được chấm 100 khi trả lời đúng |
| CSV và tương thích dữ liệu cũ | Unit CSV: đủ cột tín hiệu, dữ liệu cũ bằng 0, vẫn chống công thức Excel trong tên; kiểm tra API xuất CSV thật |
| Chơi phòng và khôi phục | 100 STOMP, 100 đáp án, kiểm tra quyền kênh; restart giữ thành viên, đáp án, thứ tự lựa chọn và phiên khách |
| Bàn giao chạy được | Docker build, TypeScript, test, hướng dẫn và ZIP cập nhật; ứng dụng local tiếp tục hoạt động |

Chi tiết số liệu và giới hạn phép đo trong `TEST_REPORT.md`. Chưa chứng nhận trên điện thoại vật lý/Safari/Firefox hoặc kiểm toán bảo mật độc lập. Giữ các giới hạn này khi triển khai cho lớp học.
