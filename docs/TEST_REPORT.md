# Báo cáo kiểm thử và bàn giao VJU Quiz

## Bổ sung ngân hàng 100 câu mỗi chương (15/10/2026)

Ngân hàng được cân bằng thành 800 câu thuộc 8 chương. Thêm 712 câu tự biên soạn theo giáo trình, giữ 18 câu Blooket, 50 câu CSV và 20 câu cơ bản; lưu trữ 4 câu cơ bản chương 3 gần trùng CSV. Tám bộ quiz chương được xuất bản phiên bản mới, mỗi bộ 100 câu; quiz CSV vẫn 50 câu. Không thay đổi mã frontend/backend trong đợt bổ sung nội dung này.

**14 kiểm tra thực thi đều đạt**. Nhập lần đầu thêm 712 câu; chạy lại thêm 0 câu. Đã đối chiếu đủ 800 câu lưu trong database với nguồn, 8 bộ 100 câu, bộ CSV 50 câu, các phiên bản cũ và phòng thử 4 câu. Bài học 100 câu với 1 đúng, 1 sai, 98 bỏ trống được chấm 1.00 điểm; nộp lặp giữ điểm và thời gian. Chi tiết trong `course-800-verification.json`, `course-800-structure.json` và log import/rerun.

Kiểm tra trực tiếp trên trình duyệt tích hợp: trang chủ hiện 800 câu, cả 8 thẻ chương hiện 100; mở bộ chương 8, chọn sai nhận đáp án/lời giải, khóa lựa chọn, chuyển tới câu 100 và nộp bài. Ở 390 × 844 px không tràn ngang; kết quả hiển thị 1 sai và 99 bỏ trống. Không có lỗi ứng dụng trong console đã kiểm tra. Ảnh: `bank-800-desktop.png`, `course-100-mobile.png`, `demo-room-941196.png`. Chưa thử trên điện thoại thật trong đợt này.

Các câu mới là nội dung tự biên soạn để ôn tập. Đối chiếu nguồn và kiểm tra dữ liệu không phải chứng nhận học thuật độc lập; đáp án từ Blooket/CSV được giữ với giới hạn đã nêu trong tài liệu học liệu. Các kết quả tải và hồi quy ở các mục sau thuộc những đợt kiểm thử ứng dụng trước đó, không được tính là mới chạy lại trong đợt này.

Ngày: 15/10/2026. Bản chạy tại http://localhost:3000; quản trị tại http://localhost:3000/admin.

## Cập nhật giao diện chơi quiz và ghi nhận tập trung

Đợt UI/UX tiếp theo cùng ngày 15/10/2026, sau cập nhật học liệu. Đối chiếu yêu cầu và giới hạn trong `UX_UPGRADE.md`.

| Nhóm | Bằng chứng của đợt UI/UX |
|---|---|
| Java | **11 unit test đạt**; thêm sự kiện fullscreen, CSV có tín hiệu, dữ liệu cũ và giữ chống công thức Excel |
| API | **34 hồi quy + 10 kiểm tra phản hồi/ghi nhận đạt**; fullscreen lưu đúng, gộp lặp, host-only; người có tín hiệu vẫn được chấm đúng |
| Trình duyệt | **8 kịch bản đạt qua các lần chạy**: 3 luồng cũ, 4 luồng điều khiển/phím tắt/âm thanh/offline/fullscreen/giảm chuyển động, 1 phản hồi phục hồi đến trễ |
| Build | TypeScript, Docker frontend và backend đạt |
| Đồng thời HTTP | 100/100 đáp án; p50 194,10 ms; p95 326,13 ms; max 340,95 ms |
| 100 STOMP | 100/100 đáp án; mở câu đến đủ người trong 26 ms; đáp án p50 265 ms, p95 464 ms, max 483 ms; 3 kiểm tra quyền kênh đạt |
| Restart | Giữ 100 thành viên, đáp án, phiên khách và thứ tự lựa chọn riêng |
| Giao diện thật | Đối chiếu trang chủ/bài học/kết quả trong trình duyệt tích hợp; hết giờ 4 phút tự chuyển kết quả đúng; điện thoại 390 × 844 |
| CSV bản chạy cuối | Kiểm tra API trả đủ 11 cột, cột số lượng hợp lệ, phản hồi riêng có `Cache-Control: no-store` |

Đã sửa vòng Tab trong dialog sau khi test phát hiện focus đi ra ngoài hộp. Test lỗi lưu được thu hẹp selector để phân biệt thông báo lỗi ứng dụng với route announcer của Next.js. Test phản hồi trễ chủ động giữ một phản hồi đọc trạng thái cũ rồi trả sau lựa chọn mới; cả UI và database vẫn giữ lựa chọn mới. Các thay đổi CSV cuối cùng được kiểm thử unit và API trên bản chạy thật; không chạy lại bộ tải vì không thay đổi xử lý phòng/đáp án.

Log: `ux-unit.log`, `ux-types.log`, `ux-build*.log`, `ux-backend-final.log`, `ux-integration.log`, `ux-fair-play-api-final.log`, `ux-browser.log`, `ux-browser-retry.log`, `ux-browser-evidence.log`, `ux-race-test.log`, `ux-realtime.log`, `ux-restart.log`, `ux-final-api.json`. Log lần đầu có hai test chưa đạt; các log retry ghi kết quả sau sửa. Visibility được mô phỏng trong browser test để xác nhận handler, không phải kiểm thử phát hiện gian lận thực tế. Fullscreen dùng API trình duyệt thật. Âm thanh kiểm tra tạo oscillator thực khi bật, không xác nhận âm lượng loa vật lý.

Điều kiện máy/loopback và giới hạn tải như phần cấu hình bên dưới. Không có cam kết chống gian lận tuyệt đối, chưa kiểm thử trên điện thoại thật hay Safari/Firefox.

## Cập nhật học liệu và làm bài công bằng

Đợt cập nhật ngày 15/10/2026 sau bản bàn giao đầu tiên:

- **9 unit test đạt**: thêm phản hồi tức thì, khóa lựa chọn đầu, không lộ câu chưa trả lời, ánh xạ đáp án/phân bố sau đảo, dữ liệu phòng cũ và giới hạn/sự kiện trùng.
- **34 kiểm tra API hồi quy và 10 kiểm tra API mới đạt** trên database riêng. Kiểm tra mới bao gồm quyền sở hữu phản hồi/sự kiện, không đưa bài học vào xếp hạng, bố cục A–D riêng và chấm đúng cho tám người có bố cục khác nhau.
- **3 kịch bản trình duyệt đạt**: sinh viên, quản trị/chủ trì và học từng câu. Kiểm tra phản hồi khi sai, hiển thị đúng/sai, khóa đáp án, tải lại, thông báo hạn chế sao chép và không tràn ngang ở 390 px. Locator chương mẫu và số câu cố định trong test cũ được sửa để dùng dữ liệu thực tế; kịch bản chủ trì được chạy lại thành công với bộ Nhóm 7 50 câu.
- TypeScript và build Docker production thành công. Các bài test này không thay thế một kiểm toán bảo mật độc lập.
- **100 kết nối STOMP**, ba kiểm tra quyền kênh và **100/100 đáp án** đạt; cập nhật đến đủ người trong 36 ms. Đáp án p50 **259 ms**, p95 **411 ms**, lớn nhất **428 ms**. HTTP đồng thời p50 173,91 ms, p95 304,14 ms, lớn nhất 319,17 ms. Cấu hình máy và giới hạn đo như phần bên dưới.
- Khởi động lại backend test: giữ 100 thành viên, đáp án, xếp hạng, phiên khách, **thứ tự lựa chọn và đáp án hiển thị riêng của người chơi**.
- Học liệu ở đợt cập nhật trước **92 câu / 8 chương / 9 quiz**: 18 Blooket, 50 CSV Nhóm 7, 24 câu tự biên soạn theo giáo trình. Đã kiểm tra cấu trúc cả 50 dòng CSV, nhập đủ và chạy lại script không tạo trùng. Không nhập Azota theo yêu cầu người dùng. Kiểm tra cấu trúc dữ liệu không đồng nghĩa thẩm định học thuật tất cả đáp án nguồn.

Bằng chứng mới gồm `fair-play-api-results.json`, `course-import.json`, `restart-results.json`, `realtime-results.json`, log `update-*`, `content-validation.json` đối chiếu đủ 92 câu lưu trong database với nguồn chuẩn hóa và ảnh phản hồi. Phản hồi trên desktop và điện thoại được xem lại trực tiếp trong trình duyệt tích hợp; ảnh `instant-feedback-mobile.png` và `instant-feedback-desktop.png` được chụp theo viewport để tránh lỗi ghép ảnh toàn trang của Chrome. Không đóng gói cookie/phiên đăng nhập trong bằng chứng. Giới hạn: chưa kiểm thử điện thoại thật, Safari/Firefox, mất sự kiện tập trung khi offline hay khả năng ngăn người dùng cố tình vượt chặn copy. Tín hiệu tập trung không dùng để tự phạt.

## Kết quả bản đầu (trước cập nhật học liệu)

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

Học liệu hiện tại gồm 800 câu với nguồn và giới hạn như phần cập nhật ở đầu báo cáo; các ảnh và số liệu trong phần bản đầu có thể còn nội dung minh họa. Tên là tự khai, danh tính theo cookie trình duyệt. Màu chưa được xác nhận là mã nhận diện chính thức VJU. Bản hiện tại chạy một backend và tối đa 100 người/phòng. Chưa triển khai tên miền công khai; localhost chỉ truy cập từ máy này. Hướng dẫn cấu hình HTTPS, origin, cookie và sao lưu nằm trong README.

Kiểm thử tự động tập trung Chrome và kích thước điện thoại giả lập; chưa chứng nhận trên Safari/Firefox hoặc điện thoại vật lý. Kiểm tra dependency frontend không thay thế một cuộc kiểm toán bảo mật toàn diện.
