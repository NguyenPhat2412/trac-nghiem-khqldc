# Kiểm thử chạy lâu VJU Quiz — 100 sinh viên

## Kết quả

Đã chạy **1829 giây (30.48 phút thực)**, 100 sinh viên mô phỏng, 100 câu. Trạng thái cuối `passed`, đối chiếu kết quả riêng của đủ 100 người đạt. Bắt đầu UTC: 2026-10-15T15:57:57.717Z.

| Chỉ số | Kết quả |
|---|---:|
| Yêu cầu HTTP đã nhận phản hồi | 166,966 |
| Đáp án được nhận | 9,900 |
| Cố tình mất mạng quá hạn, tính bỏ trống | 100 |
| Kiểm tra gửi trùng sau đóng câu | 1,000 |
| Kiểm tra đáp án quá hạn | 100 |
| Lần kết nối lại thành công | 3,720 |
| Kết nối bị giữ nhưng bỏ lưu lượng (blackhole) | 1,340 |
| Kiểm tra ẩn khóa đáp án trong câu đang mở | 110,493 |
| Lỗi kiểm tra ngoài kịch bản gián đoạn chủ động | 0 |
| Lỗi STOMP bất ngờ | 0 |
| Khởi động lại máy chủ ở câu 50 giữ nguyên dữ liệu | True |

100 × 100 = 10.000 cơ hội trả lời: 9.900 đáp án và 100 câu bỏ trống chủ động. Những đáp án gửi sau hạn bị từ chối đúng quy tắc; không phải lỗi hệ thống. Các lỗi kết nối trong lúc cố tình khởi động lại được dự kiến, không tính vào số lỗi bất ngờ.

## Kịch bản

- 100 phiên khách độc lập, cùng tên hoặc khác tên không được dùng làm định danh. Client dùng HTTP thật và cùng thư viện STOMP với giao diện, cookie/CSRF riêng, tải lại trạng thái mỗi 4 giây và khi nhận sự kiện đã gộp 120 ms.
- Mỗi câu ngắt mạng luân phiên 20 sinh viên; mỗi 15 câu ngắt cả 100 người. Hai trong ba vòng giữ TCP nhưng bỏ toàn bộ dữ liệu; vòng còn lại đóng kết nối. Lượt phục hồi trong bài chạy dài chủ động đóng socket cũ, mở kết nối mới và kiểm tra trạng thái máy chủ.
- Mỗi 10 câu có 10 người ở ngoài mạng đến quá hạn 15 giây; thời gian của câu bỏ trống phải đúng 15.000 ms.
- Mỗi câu kiểm tra lựa chọn không đổi, thứ tự đáp án riêng không đổi, số câu đúng, thời gian tăng đúng phạm vi, không lộ đáp án trước khi đóng. Gửi câu trước bị từ chối; gửi trùng không đổi lựa chọn hoặc thời gian. Cuối bài mỗi sinh viên chỉ nhận chi tiết của chính mình.
- Khởi động lại riêng test-backend ở câu 50, lúc đã công bố kết quả câu đó. Đủ 100 client nối lại; phiên bản phòng và bảng xếp hạng khớp dữ liệu trước khi khởi động lại.
- Phép thử độc lập dùng mất mạng âm thầm **không ép kết nối lại**: client tự phục hồi trong khoảng 22 giây. Thử mất phản hồi HTTP sau khi máy chủ đã nhận đáp án: tải lại thấy đáp án cũ, gửi lại lựa chọn khác không ghi đè.
- Một trình duyệt thật: vào phòng thử riêng → chuyển offline → hiện thông báo/khóa lựa chọn → online → câu và các lựa chọn giữ nguyên → trả lời → tải lại → vẫn chọn đáp án cũ → hiện lời giải và điểm. Không có nút điều khiển chủ trì, trang lỗi hoặc lỗi console sau phục hồi.

## Các lỗi đã sửa

1. **Socket mất mạng âm thầm giữ chỗ quá lâu:** trước sửa, 4 socket chết vẫn chiếm hạn mức và kết nối thứ 5 không vào được sau 45 giây. Bật heartbeat hai chiều 10 giây với scheduler do Spring quản lý. Sau sửa, vào lại được ở mốc kiểm tra 45 giây; 4 TCP cũ đóng hết ở mốc 75 giây. Có thời gian chờ đóng TCP, không khẳng định tất cả TCP đóng ngay ở giây 45.
2. **Client chờ đóng socket lỗi làm nối lại chậm:** bỏ ngay socket khi mất heartbeat, giới hạn thiết lập kết nối 10 giây. Phép thử so sánh client cũ/mới trên broker đã bật heartbeat: khoảng 52 giây → 22 giây.
3. **REST treo có thể khóa làm mới phòng hoặc nút trả lời:** thêm thời hạn 15 giây cho cả bước lấy CSRF, chờ phản hồi và đọc nội dung. Excel giữ 120 giây. Không tự phát lại thao tác ghi khi hết hạn.
4. **Phản hồi HTTP 200 bị cắt được nhận nhầm thành dữ liệu phòng:** giờ báo lỗi và giữ trạng thái hợp lệ trước đó, thay vì áp dụng đối tượng giả thiếu trường.
5. **Trang đã kết thúc vẫn tạo tải nền:** ngừng polling và đóng WebSocket khi nhận kết quả cuối; nhãn chuyển sang “Đã hoàn tất”. Trang chủ trì chỉ dựng bài chi tiết của sinh viên được chọn, thay vì dựng mọi bài cùng lúc. Quyền xem dữ liệu vẫn được kiểm tra trên backend.

Đã kiểm tra bổ sung trên trình duyệt: trang tổng kết cũ phát 5 yêu cầu cách nhau 4 giây; bản mới không phát yêu cầu phòng trong hơn 20 giây. Với chính phòng 100 người, sự kiện WebSocket đóng được ghi nhận sau tổng kết; danh sách có đủ 100 sinh viên, chọn một người chỉ dựng 100 câu của người đó, không có lỗi console.

## Độ trễ và tài nguyên

- Toàn bộ yêu cầu trả lời, gồm cả yêu cầu cố tình bị từ chối: p50 **362 ms**, p95 **2024 ms**, p99 **3055 ms**, tối đa **4256 ms**.
- Toàn bộ HTTP: p95 823 ms, p99 2020 ms, tối đa 4256 ms.
- Bảng dưới là trung vị p95 từng câu trong giai đoạn, không phải p95 gộp của giai đoạn.

| Giai đoạn | Trung vị p95 từng câu | Yêu cầu trả lời chậm nhất |
|---|---:|---:|
| Câu 1–10 | 412 ms | 551 ms |
| Câu 41–50 | 1046 ms | 1245 ms |
| Câu 91–100 | 2971 ms | 4149 ms |

Độ trễ tăng ở cuối bài. Hiện phòng lưu dữ liệu JSONB aggregate nên khối lượng lịch sử đọc/ghi cũng tăng; đây là điểm cần tối ưu tiếp nếu yêu cầu phản hồi dưới một giây xuyên suốt. Bài chạy có các đợt biên dịch giao diện phát triển và kiểm tra UI trên cùng máy; chưa tách riêng ảnh hưởng của các tác vụ đó để quy toàn bộ mức tăng cho một nguyên nhân. Đã kiểm tra đến giới hạn 100 người × 100 câu, nhưng không suy ra khả năng nhiều phòng đồng thời từ bài thử này.

- Mẫu RAM container backend: thấp nhất 125.3 MiB, cao nhất 1231.9 MiB. Có một lần khởi động lại chủ động ở giữa bài; không dùng dãy này để khẳng định không rò rỉ bộ nhớ qua đêm.
- Danh mục bản chính: 51 mẫu, 51 phản hồi thành công; trung vị 16.69 ms, chậm nhất 168.15 ms. Cache công khai vẫn tách khỏi trạng thái phòng/đáp án riêng.
- Quan sát tài nguyên mỗi khoảng 30 giây; có thể bỏ lỡ đỉnh CPU hoặc chờ khóa ngắn. Số liệu không thay thế profiling liên tục.
- Máy: Apple M4 Pro, RAM 48 GiB; Docker Desktop 12 CPU, RAM 7.75 GiB; ARM64. Một backend thử và PostgreSQL trên máy local; bản chính cũng đang chạy. Có kiểm tra giao diện và hồi quy ngắn song song.

## Kiểm tra bổ sung và phạm vi

18 unit test backend, 5 unit test deadline/phản hồi mạng, TypeScript, 217 yêu cầu hồi quy bảo mật và 10 nhóm fair-play đạt. Chi tiết build/triển khai ghi trong `release-check.json` khi cập nhật xong.

Đây là 100 client giao thức và một trình duyệt thật, không phải 100 máy hoặc 100 trình duyệt render đồng thời. Mô phỏng ngắt dữ liệu/đóng kết nối/offline; chưa đo Wi-Fi thật, mạng di động, mạng Internet công cộng hoặc chạy 8–24 giờ. Không kết luận hệ thống miễn nhiễm mọi lỗ hổng từ kết quả này.

Dữ liệu thử nằm riêng ở `vju_quiz_test`; ngân hàng câu hỏi chính và phòng người dùng không bị đặt lại. PostgreSQL vẫn dùng chung container nên không cách ly hoàn toàn tài nguyên máy.

## Bằng chứng

- `results.json`: tiến độ, độ trễ từng câu, tổng kiểm tra.
- `monitor.json`, `environment.json`: cấu hình và mẫu tài nguyên.
- `network-probe-before.json` / `network-probe-after.json`: tái hiện và xác nhận thu hồi socket.
- `network-recovery-before.json` / `network-recovery-after.json`: tự nối lại và mất phản hồi đáp án.
- `ui-check.json`, `ui-recovered.jpg`: kiểm thử giao diện sau nối mạng và tải lại.
- `soak-security-regression.log`, `soak-fair-play.log`: kiểm tra quyền, khóa đáp án, lựa chọn riêng.
- `finished-idle-check.json`, `host-100-result.json`, `host-100-result.jpg`: xác nhận ngừng tải nền, đóng WebSocket, chọn bài riêng trên phòng 100 người.
- Cách chạy lại nằm trong README của dự án.
