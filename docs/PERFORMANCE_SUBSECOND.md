# Tối ưu phản hồi cuối bài — 100 sinh viên

## Thay đổi

Trước sửa, một lượt trả lời ở câu 100 ghi lại khoảng 981 KB gồm quiz và toàn bộ lịch sử của 100 người. Khi các yêu cầu cùng chờ khóa phòng, p95 ba lượt đo là 3.113 / 3.900 / 3.988 ms. Đọc kết quả cuối đơn lẻ vẫn nhanh; nút thắt chính của bài đo là đường ghi đáp án nối tiếp trên aggregate lớn.

Schema V4 tách quiz cố định và lịch sử trả lời khỏi hàng phòng. Hàng cập nhật thường xuyên chỉ còn khoảng 40 KB; điểm và thời gian câu trước được cộng dồn. Snapshot có cache nội bộ giới hạn; dữ liệu quyền/thành viên và trạng thái vẫn đọc PostgreSQL. Lịch sử cuối bài chỉ tải cho đúng người có quyền. Xem [kiến trúc](ARCHITECTURE.md) để biết giao dịch, chuyển phòng cũ và rollback.

Cũng sửa mã hóa UTF-8 của thông báo từ bộ lọc bảo mật. Việc từ chối truy cập và CSRF không thay đổi, thông báo tiếng Việt không còn bị sai ký tự.

## Cách đo

- Máy Apple M4 Pro / RAM 48 GiB; Docker Desktop 12 CPU / RAM 7,75 GiB; PostgreSQL 17, một backend Java 21. Bản chính và bản thử chạy cùng máy, khác database. Không build ứng dụng hay chạy bài tải khác trong bài đo kéo dài hợp lệ.
- Ba lượt so sánh trước/sau dùng cùng fixture có 99 câu đã hoàn thành; 100 client HTTP thật đồng thời trả lời câu thứ 100, sau đó 100 người lấy kết quả. Dữ liệu 99 câu được nạp trước ngoài khoảng đo; không gọi đây là chạy đủ 100 câu. Sau sửa p95 gửi đáp án là 235 / 187 / 176 ms; tối đa mỗi lượt 236 / 190 / 191 ms.
- Bài giao thức chạy đủ 100 câu: 100 phiên độc lập dùng HTTP/STOMP thật, cookie và CSRF riêng, gộp sự kiện 120 ms và polling 4 giây giống frontend. Mỗi câu cả 100 người gửi đồng thời. 10.000 đáp án được nhận, không mất/trùng; 100 kết quả riêng đối chiếu đúng. Thời gian 118 giây; p95 gửi đáp án 245 ms, p99 287 ms, tối đa 400 ms. Câu 100 p95 256 ms; 100 lượt lấy kết quả p95 86 ms, tối đa 87 ms; lệnh chủ trì tổng kết 78 ms.
- Bài chạy kéo dài với ngắt mạng, hết giờ, nối lại và restart được ghi riêng sau khi hoàn thành. Một lượt trước đó bị máy tự ngủ lúc 23:58:09 ngày 15/10/2026 (+07); có timeout phục hồi, không được tính đạt. Giữ nguyên log và disposition. Lượt chạy lại dùng `caffeinate -is` chỉ trong thời gian thử, không sửa thiết lập nguồn lâu dài.

Mục tiêu dùng p95 dưới 1.000 ms: toàn bộ đáp án được nhận, riêng từng câu trong 10 câu cuối, lấy kết quả của 100 sinh viên và lệnh tổng kết của chủ trì. Báo cáo vẫn nêu độ trễ tối đa. Các số đo là HTTP từ đầu gửi đến khi đọc xong JSON ở máy local, không đại diện cho Internet hoặc 100 trình duyệt cùng render.

## Kiểm tra tính đúng

- Unit test điểm/đồng hạng/bỏ trống; cache chỉ publish sau commit, rollback không để lại cache; cache tách khỏi đối tượng tạo phòng; eviction đọc lại đúng snapshot.
- API kiểm tra đáp án đầu tiên, hạn giờ, quyền, ẩn đáp án, Excel, phiên bản và 100 lượt gửi đồng thời.
- `scripts/room-storage-regression.py`: chuyển đổi phòng cũ giữ version/thứ tự/điểm; người không có quyền gây rollback toàn bộ chuyển đổi; restart giữa câu và sau kết thúc; chi tiết cá nhân và báo cáo đối chiếu điểm/thời gian; sửa ngân hàng không đổi snapshot.
- Hồi quy bảo mật 11 nhóm / 217 yêu cầu và fair-play 10 nhóm.

## Chạy lại

Xem phần kiểm thử dưới một giây trong [README](../README.md). Chỉ chạy test backend/database. Không dùng script reset hay restart khác trong lúc soak đang hoạt động. `acceptedAnswers` tách riêng yêu cầu thành công, `answers` vẫn bao gồm các lần cố tình bị từ chối. `recoveryIncludingOffline` có cả khoảng mất mạng chủ động, không phải độ trễ đáp án.

## Vận hành

Cần backup trước khi triển khai. Phòng cũ chuyển đổi khi có lệnh giữ khóa; phòng đang làm và kết quả trước đó được giữ lại. Sau khi có dữ liệu compact, rollback về backend cũ phải kèm khôi phục database đúng phiên bản, không chỉ đổi image.

## Kết quả chạy kéo dài sau tối ưu

Hoàn tất 1826 giây (30.43 phút thực), 100 sinh viên × 100 câu; 117,909 phản hồi HTTP. Có 9,900 đáp án được nhận và 100 câu cố tình bỏ trống quá hạn. Đối chiếu đủ 100 kết quả cá nhân đạt.

- Đáp án được nhận: p50 83 ms, p95 **218 ms**, p99 374 ms, tối đa **681 ms**.
- p95 từng câu trong 10 câu cuối: 160–221 ms.
- 100 người lấy kết quả: p95 **75 ms**, tối đa 76 ms; chủ trì tổng kết **90 ms**.
- 3,720 lần nối lại; 1,000 kiểm tra gửi trùng sau đóng câu; 100 kiểm tra trả lời muộn; 61,477 kiểm tra không lộ khóa khi câu đang mở; 12,380 kiểm tra trạng thái/điểm/thời gian.
- Restart ở câu 50: phiên bản phòng và bảng xếp hạng giữ nguyên; cả 100 client nối lại. Không có lỗi kiểm tra ngoài kịch bản hoặc lỗi STOMP bất ngờ.
- Tất cả ngưỡng `SOAK_SLO_MS=1000` đạt. Không suy ra bảo đảm cho mọi máy chủ/mạng từ kết quả local.

| Giai đoạn | Trung vị p95 từng câu | Chậm nhất trong giai đoạn |
|---|---:|---:|
| Câu 1–10 | 221 ms | 293 ms |
| Câu 41–50 | 202 ms | 535 ms |
| Câu 91–100 | 182 ms | 245 ms |

RAM backend ở các mẫu: 239.7–611.5 MiB, có một lần restart chủ động. Bản chính phản hồi thành công 58/58 mẫu. Việc lấy mẫu khoảng 30 giây có thể bỏ lỡ đỉnh ngắn; không dùng phép thử này để kết luận không có rò rỉ qua đêm.

## Sửa thêm khi kiểm tra triển khai và kiểm thử bản cuối

Một tab cũ dùng CSRF không còn khớp cookie liên tục thử CONNECT lại. Đã sửa backend đóng/loại frame bị từ chối và ghi audit không chứa token; frontend dừng reconnect và polling khi đóng vì quyền/phiên (1008), giữ thông báo và hướng dẫn tải lại. Lỗi máy chủ tạm thời đóng bằng 1011 để vẫn nối lại. Không giảm kiểm tra quyền, CSRF hoặc hạn mức socket.

Đã kiểm tra giao diện production thật: không có yêu cầu hay reconnect trong 29,8 giây sau từ chối; tải lại với phiên hợp lệ, trả lời đủ hai câu, nhận 100 điểm và chỉ thấy bài riêng, không lỗi console. Đã kiểm tra lại 5 CONNECT sai, SUBSCRIBE ngoài quyền và SEND giả: đóng bằng 1008, giải phóng chỗ và không ghi token. Sáu kiểm tra giới hạn socket/subscription đạt. Mất mạng âm thầm vẫn tự nối lại khoảng 22 giây, phản hồi đáp án bị mất vẫn phục hồi lựa chọn đầu tiên.

Bài chạy 30 phút ở trên hoàn thành trước phần sửa đường từ chối kết nối này; đường lưu trữ/chấm điểm không đổi. Bản cuối được chạy lại 100 người × 100 câu đồng thời: p95 toàn bài **563 ms**, p99 **844 ms**, tối đa **1.439 ms**. P95 từng câu trong 10 câu cuối **589–831 ms**; 100 lượt lấy kết quả p95 **189 ms**, tối đa **192 ms**; lệnh tổng kết **109 ms**. Đủ 10.000 đáp án và 100 kết quả đúng, không lỗi kiểm tra. Ngưỡng p95 toàn bài và 10 câu cuối đạt; **không phải mọi vòng đều dưới một giây**: câu 82/83/84 có p95 1.128/1.072/1.400 ms. PostgreSQL ghi nhận checkpoint bắt đầu trong giai đoạn này, nhưng chưa tách riêng ảnh hưởng để kết luận là nguyên nhân duy nhất. Không tắt fsync hoặc giảm độ bền dữ liệu để cải thiện số đo.

Chốt bản: **25 unit test backend**, **5 test mạng frontend**, **34 kiểm tra tích hợp API**; chạy lại **11 nhóm bảo mật / 217 yêu cầu**, **10 nhóm fair-play**, kiểm tra cache/lịch sử/rollback/restart đều đạt. Hai unit test mới xác nhận lỗi quyền đóng 1008, lỗi máy chủ vẫn cho phép nối lại qua 1011. Các WARN/ERROR chủ động trong hai unit test là đầu vào mô phỏng đã kiểm chứng, không phải test thất bại.
