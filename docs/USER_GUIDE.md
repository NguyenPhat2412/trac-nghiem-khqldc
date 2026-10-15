# Hướng dẫn VJU Quiz

## Sinh viên

1. Mở trang chủ, nhập tên. Không cần mật khẩu hoặc email.
2. Tự luyện: chọn một bộ quiz có xếp hạng, hoặc bấm một/nhiều chương để tạo bài luyện riêng.
3. Chọn đáp án; đáp án được lưu khi hệ thống báo “Đã lưu”. Có thể đánh dấu và chuyển câu. Đừng đóng trang trong lúc đang lưu.
4. Nộp bài, xem điểm và mở từng câu để đọc giải thích. Có thể luyện lại câu sai.
5. Vào phòng: nhập tên và mã 6 số do người chủ trì cung cấp; chờ bắt đầu, mỗi câu chỉ gửi một đáp án.
6. Khi mất mạng, kết nối lại trên cùng trình duyệt. Đồng hồ vẫn chạy theo máy chủ.

Điểm bằng tỷ lệ câu đúng trên thang 100. Cùng số câu đúng thì thời gian ngắn hơn xếp trước; giống cả hai thì đồng hạng. Bảng tự luyện giữ lượt tốt nhất và ghi số lượt đã làm. Bài tự chọn chương/câu sai không tham gia bảng chung.

## Người quản lý

1. Đăng nhập `/admin` bằng tài khoản được cấp. Quản trị viên ban đầu xem mật khẩu ở file `.env` trong dự án.
2. Tạo chương, mô tả và thứ tự. Xuất bản để sinh viên nhìn thấy chương.
3. Thêm câu hỏi: chọn chương, nhập đủ A–D, chọn đáp án đúng, giải thích và trạng thái. Xem trước rồi lưu.
4. Tạo quiz: chọn các câu đã xuất bản hoặc lấy ngẫu nhiên theo chương. Chốt thời gian cả bài tự luyện và thời gian từng câu trong phòng.
5. Xuất bản quiz. Bộ câu hỏi được cố định; sửa tạo phiên bản mới để không ảnh hưởng bài cũ.
6. Mở “Phòng chơi”, chọn quiz, bấm tạo phòng. Chia sẻ mã, đường dẫn hoặc QR. Bấm bắt đầu khi lớp đã vào đủ.
7. Sau mỗi câu, xem phân bố câu trả lời và bấm câu tiếp theo. Có thể kết thúc sớm; báo cáo sẽ ghi rõ.
8. Xem “Báo cáo”, lọc và xuất CSV. Biên tập viên chỉ xem các phòng mình tạo.

## Nhập Excel

Tải mẫu từ “Nhập Excel”. Một dòng là một câu. Các cột:

| Cột | Nội dung |
|---|---|
| chapterId | Mã chương hiển thị trong trang Chương học |
| question | Nội dung câu hỏi |
| A, B, C, D | Bốn lựa chọn không được để trống |
| correct | A, B, C hoặc D |
| explanation | Lời giải |
| difficulty | EASY, MEDIUM hoặc HARD |
| imageUrl | Liên kết HTTPS, có thể trống |
| status | DRAFT, PUBLISHED hoặc ARCHIVED |

Chọn tệp để xem trước. Sửa dòng lỗi trực tiếp trên trang, rồi xác nhận nhập tất cả. Nếu còn lỗi, hệ thống không lưu bất kỳ dòng nào. Dòng minh họa trong mẫu cần thay nội dung trước khi dùng chính thức.

## Nhân sự và bảo trì

Quản trị viên cấp quyền ADMIN hoặc EDITOR và khóa tài khoản. Không thể tự khóa hoặc hạ quyền tài khoản đang dùng. Mật khẩu tối thiểu 12 ký tự. Khi đổi mật khẩu, các phiên khác của tài khoản bị thu hồi.

Dữ liệu lưu tại `data/postgres` trên ổ D. Sao lưu bằng `scripts/backup.sh`. Giữ file `.env` và các bản sao lưu trong nơi riêng tư; không đưa vào kho mã nguồn công khai.
