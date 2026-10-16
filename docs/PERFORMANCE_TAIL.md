# VJU Quiz — xử lý độ trễ cao nhất với 100 sinh viên

Ngày 16/10/2026. Bản tối ưu đáp ứng ngưỡng **tối đa dưới 1.000 ms** trong các bài thử hoàn tất dưới đây trên máy hiện tại. Đây là ngưỡng tối đa quan sát được, không chỉ p95.

## Nguyên nhân và cách sửa

Trước sửa, mỗi đáp án đọc/khóa/ghi cùng một bản ghi phòng và commit riêng. Khi 100 người gửi đồng thời, các yêu cầu nối đuôi nhau; khoảng ghi đĩa chậm kéo dài hàng đợi. Bài tái hiện đạt tối đa 1175 ms, bên cạnh lần đo trước 1.439 ms. Lấy mẫu PostgreSQL mỗi 100 ms ghi nhận 5.329/6.403 mẫu kết nối đang hoạt động (83,2%) chờ khóa, truy vấn chờ lâu nhất 498 ms. Đây là bằng chứng trực tiếp về tranh chấp khóa; không quy mọi độ trễ cho checkpoint.

Đã gom lệnh đến gần nhau trong cửa sổ 10 ms theo phòng. Mỗi đợt chỉ khóa/ghi/commit một lần, vẫn kiểm tra quyền, câu hỏi, hạn giờ và đáp án đầu tiên riêng cho từng người. Lượt tải cao bản cuối chỉ cần **1–2 giao dịch thay đổi trạng thái cho mỗi 100 đáp án**, thay cho 100 giao dịch. Mẫu quan sát sau sửa không ghi nhận chờ khóa (không có nghĩa mọi lần chạy đều tuyệt đối không chờ).

Cũng sửa nhánh đọc khi hết giờ: dùng khóa có điều kiện `SKIP LOCKED`, tránh xếp hàng lấy khóa cho từng người cùng kiểm tra hết giờ. Yêu cầu thua quyền đóng câu đọc lại trạng thái đã commit, không tự dựng trạng thái REVEAL hoặc công bố khóa trước commit; sự kiện sau commit và polling cập nhật trạng thái tiếp theo. Kiểm tra giữ khóa phòng có chủ đích trả về trạng thái riêng tư dưới 1 giây ngay cả khi khóa vẫn đang bị giữ, rồi xác nhận REVEAL thật sau khi giải phóng khóa.

Phản hồi thành công và sự kiện chỉ được phát sau commit. Thời gian chấm lấy lúc máy chủ nhận lệnh đã xác thực, không cộng thêm thời gian đợi gom. Không lưu quyền hoặc kết quả cá nhân vào cache dùng chung. Hàng đợi có giới hạn tổng/phòng/người và tối đa 32 phản hồi chờ cho cùng lệnh, gửi lặp cùng người dùng chung lựa chọn đầu tiên; API có hạn mức chống gửi dồn. Không thay schema V4; giữ `fsync`, `synchronous_commit`, `full_page_writes` bật.

## Kết quả bản cuối

| Bài thử | Đáp án nhận | p95 trả lời | Trả lời chậm nhất | Đọc phòng chậm nhất | Kết quả cuối chậm nhất | Chủ trì tổng kết |
|---|---:|---:|---:|---:|---:|---:|
| 100 người × 100 câu cùng gửi | 10,000 | 43 ms | **146 ms** | 203 ms | 78 ms | 64 ms |
| Mất mạng, nối lại, restart giữa bài | 9,900 | 41 ms | **350 ms** | 758 ms | 100 ms | 94 ms |

- Lượt đồng thời: 116 giây, 45,808 phản hồi HTTP; 20 CHECKPOINT chủ động cùng tải trả lời.
- Lượt sự cố: 667 giây (11.1 phút), 72,043 phản hồi HTTP; 3,720 lần nối lại, 1,340 lần làm mất lưu lượng kết nối, 1,140 lần ngắt kết nối chủ động. 20 CHECKPOINT; restart backend ở câu 50 và đối chiếu phiên bản/bảng xếp hạng sau phục hồi.
- 100 câu cố tình bỏ trống được tính đúng thời gian; 1,000 kiểm tra gửi lặp sau đóng câu, 100 kiểm tra gửi muộn. Đối chiếu đủ 100 bài cá nhân, đáp án, thứ tự lựa chọn, điểm và tổng thời gian ở cả hai lượt.
- Tất cả 100 vòng mỗi lượt đều qua ngưỡng tối đa dưới 1 giây; không có lỗi kiểm tra ngoài kịch bản. Khoảng chủ động mất mạng/khởi động lại được báo riêng, không được gọi là độ trễ gửi đáp án.

## Lượt phát hiện thêm độ trễ và đo chẩn đoán

Một lượt 674 giây sau khi gom đáp án nhưng trước sửa nhánh hết giờ đã nhận đúng 9.900 đáp án, chậm nhất 451 ms, nhưng **không đạt** vì một lượt đọc phòng mất 2.028 ms (kết quả cuối tối đa 689 ms). Giữ nguyên bằng chứng `reconnect-read-tail-failed.json`, không chỉ chọn các lượt đạt. Đo thêm đường đọc cho thấy độ trễ phát sinh phía máy chủ; bộ giả lập không bị dừng tương ứng, các đợt GC Java được quan sát ở mức vài đến vài chục ms. Lượt chẩn đoán đầy đủ tiếp theo tối đa đọc 815 ms; phép thử đọc dồn và hết giờ riêng cũng đạt, nên không quy tất cả biến động của lần 2 giây cho một nguyên nhân duy nhất. Trong quá trình chẩn đoán còn phát hiện các tiến trình psql lấy mẫu liên tục sống sót sau khi dừng cửa sổ công cụ; đã kết thúc đúng các tiến trình này và xác nhận không còn phiên lấy mẫu. Một lượt sau đó cũng có tải biên dịch Android ngoài dự án (ảnh chụp danh sách CPU ghi nhận ít nhất 11 tiến trình clang++ đồng thời); gửi đáp án vẫn dưới 1 giây nhưng đọc phòng vượt ngưỡng. Các lượt bị nhiễu được giữ riêng, không tính là đạt; lượt chấp nhận có theo dõi CPU host để xác nhận điều kiện đo. Không dừng hoặc sửa công việc ngoài dự án. Nhánh khóa khi hết giờ vẫn tạo khả năng xếp hàng và được sửa, kèm kiểm tra giữ khóa thực và bộ tải đầy đủ mới ở bảng trên.

## Kiểm tra bảo toàn tính đúng và quyền

34 unit test backend; 34 kiểm tra tích hợp API; 11 nhóm bảo mật / 217 HTTP; 10 nhóm fair-play; kiểm tra cache/lịch sử/rollback/restart đều đạt. Kiểm tra mới gồm cùng lúc gửi nhiều lần vẫn chỉ lưu đáp án đầu tiên, trộn yêu cầu sai/người ngoài không làm hỏng câu hợp lệ, không lộ đáp án sớm, không trả kết quả của người khác, hàng đợi đầy bị chặn, hủy một phản hồi không hủy việc lưu, và lỗi commit không được xác nhận thành công. Bài kiểm tra PostgreSQL thật dùng constraint trigger trì hoãn đến COMMIT để gây lỗi, xác nhận không phản hồi thành công hoặc lộ khóa, không có ghi dở dang, sau đó gỡ trigger và gửi lại đúng một lần. Xem log kiểm tra giao dịch thực tế trong `batch-regression.log`.

Kiểm tra riêng WebSocket khôi phục sau mất lưu lượng trong 22.023 ms theo chu kỳ heartbeat/reconnect; đây là thời gian phát hiện mất mạng, không phải độ trễ HTTP khi kết nối hoạt động. Mất phản hồi sau khi đã lưu vẫn phục hồi được lựa chọn đầu tiên, gửi lại không thay đổi đáp án. Kết nối bị từ chối vì quyền được đóng, giải phóng chỗ và không ghi token vào log.

Sinh viên vẫn bị chặn truy cập quản trị; người chưa tham gia không gửi được đáp án vào phòng. Câu hết giờ/chưa mở không được nhận. Gửi lặp không tạo thêm điểm hoặc đổi thời gian. Ứng dụng tiếp tục nhận lại trạng thái từ PostgreSQL sau restart.

## Cách đo và giới hạn kết luận

Apple M4 Pro, RAM 48 GiB; Docker Desktop 12 CPU / RAM khoảng 7,75 GiB; một backend Java 21 và PostgreSQL 17 trên cùng máy. Bản chính và bản thử dùng database riêng. Giữ máy thức trong thời gian thử. Trong hai lượt bản cuối, tôi không chạy thêm build hay bài tải khác; lấy mẫu host mỗi 10 giây không thấy tiến trình clang++ (không khẳng định máy hoàn toàn không có tải nền); bộ giả lập lấy mẫu tài nguyên container mỗi 10 vòng; bộ quan sát host chỉ đọc danh sách tiến trình mỗi 10 giây. Không chạy các vòng lấy mẫu PostgreSQL liên tục trong lượt chấp nhận.

100 phiên HTTP/STOMP độc lập, cookie/CSRF riêng; sự kiện gộp 120 ms và polling 4 giây như frontend. Đo từ lúc gửi đến khi đọc xong JSON. Lượt mất mạng chạy nhanh khoảng 4 giây tối thiểu/vòng; các vòng có chờ kết nối/hết giờ dài hơn. Đây là phép thử giao thức trên máy local, không phải 100 trình duyệt dựng giao diện, và không bảo đảm độ trễ Internet hay mọi cấu hình máy chủ. Lượt 30 phút của bản trước được giữ riêng, không dùng làm bằng chứng cho thay đổi mới.

`SOAK_SLO_MS=1000` hiện kiểm tra **max của mọi vòng**, đọc trạng thái và kết quả cuối; không còn chỉ xét p95 và 10 vòng cuối. Dùng `SOAK_CHECKPOINTS=1` để thử thêm ghi đĩa, chỉ trên môi trường thử vì CHECKPOINT tác động toàn PostgreSQL instance. Các số đo thô và cấu hình máy kèm trong thư mục này.
