# Học liệu và hỗ trợ làm bài công bằng

Cập nhật ngày 15/10/2026. Bỏ qua Azota theo yêu cầu của người dùng; không nhập câu hỏi từ liên kết đó.

## Ngân hàng hiện tại

| Chương | Nội dung | Số câu |
|---|---|---:|
| 1 | Nhập môn khoa học quản lý | 100 |
| 2 | Nguyên tắc và phương pháp quản lý | 100 |
| 3 | Chức năng lập kế hoạch và ra quyết định | 100 |
| 4 | Chức năng tổ chức | 100 |
| 5 | Chức năng lãnh đạo | 100 |
| 6 | Chức năng kiểm tra | 100 |
| 7 | Thông tin trong quản lý | 100 |
| 8 | Chọn lựa, đánh giá và phát triển cán bộ quản lý | 100 |
| **Tổng** | **8 chương, 9 bộ quiz** | **800** |

- **18 câu Blooket:** từ [bộ Khoa học Quản lý đại cương Chương 1&2 của VietHung17](https://dashboard.blooket.com/set/6ab48bdbd0064050e26f1a3a), gồm 13 câu chương 1 và 5 câu chương 2. Giữ đáp án của nguồn; bổ sung lời giải ngắn và nguồn từng câu. Câu 2 được chỉnh cách dịch hai lựa chọn để thể hiện rõ “doing things right” và “doing the right things”, tránh đảo nghĩa. Một số câu dẫn chiếu slide chưa được cung cấp, nên không coi toàn bộ câu Blooket là đã đối chiếu độc lập với giáo trình.
- **50 câu Nhóm 7:** từ tệp `Nhom 7 - Quizz.csv` do người dùng bổ sung và xác nhận nhập. Kiểm tra đủ bốn lựa chọn khác nhau, một đáp án, không trùng nguyên văn với ngân hàng đã nhập. Xếp chương 3 theo chủ đề lập kế hoạch, có bộ quiz riêng 50 câu, 33 phút 20 giây; mỗi câu trong phòng 30 giây. Giữ nội dung và đáp án từ cột `Correct Answer`, không tự nhận đã thẩm định toàn bộ đáp án. Tệp không có lời giải chi tiết; phần phản hồi ghi đáp án theo tệp cùng số câu nguồn. Độ khó tạm gán MEDIUM, có thể sửa trong quản trị.
- **732 câu tự biên soạn:** 20 câu cơ bản giữ lại và 712 câu bổ sung, dựa trên các phần đã đọc của [Giáo trình Khoa học quản lý đại cương (2019)](https://drive.google.com/file/d/1qV0Hmwd0b8e2UTyBeBNRMPx4iHqNdpta/view), chủ biên PGS.TS Phạm Ngọc Thanh, NXB Đại học Quốc gia Hà Nội. Có câu nhận biết, phân biệt khái niệm và tình huống vận dụng; lời giải ghi trang in. Đây là câu ôn tập tự biên soạn, không phải đề thi hay đáp án chính thức của giảng viên.
- **4 câu cơ bản chương 3 được lưu trữ:** nội dung gần trùng với CSV Nhóm 7; thay bằng câu ra quyết định để ngân hàng mỗi chương đúng 100 câu. Dữ liệu lưu ở `content/archived-basic-questions.json`; lịch sử và các bản chụp câu hỏi cũ được giữ.

PDF gốc là bản scan 154 trang PDF, mỗi trang thường chứa hai trang sách. Số trang tham khảo là số trang in trên sách. Dữ liệu chuẩn hóa ở `content/course-2019.json`; chạy `python3 scripts/import-course.py` để nhập bằng API quản trị. Có thể chạy lại mà không tạo trùng. Không đóng gói PDF gốc trong mã nguồn.

Tám quiz chương đã có phiên bản mới **100 câu/bộ**, thời gian 66 phút 40 giây, 30 giây/câu khi dùng trong phòng và bật đảo câu/đáp án. Quiz Nhóm 7 tách riêng 50 câu, dùng lại các câu trong chương 3, không cộng thêm vào tổng 800. Tự luyện theo chương có thể chọn ít câu hơn. Bản cũ được lưu trữ để giữ nguyên bài đang làm, phòng đang mở và kết quả.

Chương 3 gồm 50 câu lập kế hoạch từ CSV và 50 câu tự biên soạn về quyết định, tiêu chí lựa chọn, xử lý vấn đề, biểu đồ xương cá và cây quyết định. Các chương khác được bổ sung theo các mục của chương, không chỉ nhân bản một dạng câu. Những bảng scan khó đọc không được dùng làm căn cứ cho câu mới; các ví dụ quy định cũ không được diễn đạt thành pháp luật hiện hành.

Chạy `python3 scripts/validate-course.py` để kiểm tra 800 câu, bốn lựa chọn khác nhau, đáp án hợp lệ, trang nguồn trong phạm vi chương và câu trùng nguyên văn sau chuẩn hóa. Đây là kiểm tra cấu trúc và nguồn dẫn, không thay thế phản biện học thuật độc lập. Các đáp án Blooket/CSV vẫn giữ giới hạn kiểm chứng như nêu trên.

## Khi nào hiển thị đáp án?

| Chế độ | Thời điểm hiện | Có sửa sau khi xem? | Xếp hạng chung |
|---|---|---|---|
| Học từng câu | Ngay sau lựa chọn đầu tiên, cả đúng và sai | Không; máy chủ giữ lựa chọn đầu | Không |
| Làm bài có xếp hạng | Sau khi nộp hoặc hết giờ | Không sau khi kết thúc | Có |
| Chơi phòng | Sau khi câu đóng cho cả phòng | Không; mỗi câu một lựa chọn | Theo phòng |

Không hiển thị đáp án sớm trong phòng để tránh một người chuyển đáp án cho những người còn đang trả lời. Chế độ học có phản hồi tức thì được tách khỏi bảng xếp hạng. Tuy nhiên, vì đây là ngân hàng ôn tập công khai, người đã học có thể biết nội dung trước khi làm bài; bảng xếp hạng không chứng minh năng lực thi độc lập.

## Biện pháp đang có

- **Máy chủ chấm điểm và giữ thời gian:** không nhận điểm do trình duyệt tự khai; kiểm tra quyền bài/phòng, trạng thái câu và hạn trả lời; gửi lặp không tăng điểm.
- **Ẩn khóa đáp án đúng lúc:** không gửi đáp án và lời giải của câu chưa được phép xem. Trong chế độ học chỉ mở câu đã trả lời.
- **Đảo câu và lựa chọn:** bài tự luyện có thể đảo câu/A–D. Phòng dùng chung câu hiện tại nhưng mỗi người có A–D riêng khi quiz bật đảo; lưu thứ tự theo thành viên để tải lại hoặc khởi động lại không đổi. Phân bố đáp án và chấm điểm ánh xạ theo nội dung, không theo chữ cái dùng chung. Đảo ngẫu nhiên không bảo đảm mọi người có thứ tự khác nhau — bốn lựa chọn chỉ có 24 hoán vị.
- **Hạn chế sao chép ở vùng câu hỏi:** chặn thao tác copy/cut, menu chuột phải và kéo nội dung; hạn chế chọn chữ và ẩn vùng câu hỏi đang làm khi in. Có dòng tên/mã người chơi. Áp dụng cho bài xếp hạng và câu đang mở trong phòng; không gây khó cho việc đọc lời giải trong chế độ học.
- **Ghi nhận tập trung:** đếm sự kiện trang bị ẩn, thoát toàn màn hình và thao tác sao chép bị chặn, có thông báo cho người học. Chủ trì/quản trị được xem theo quyền; không đưa tín hiệu lên bảng xếp hạng công khai, không tự trừ điểm hoặc loại người chơi. Mỗi bài/thành viên lưu tối đa 100 sự kiện; sự kiện gửi lặp được gộp theo mã. CSV kết quả có các cột tín hiệu cùng cờ đạt giới hạn. Vùng câu hỏi tạm ẩn khi trang bị ẩn; toàn màn hình là tùy chọn. Xem thêm `UX_UPGRADE.md`.
- **Giữ lịch sử:** câu hỏi được chụp nội dung vào lượt làm/phòng; sửa ngân hàng không sửa kết quả cũ.

## Giới hạn và cách tổ chức nên dùng

[Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API) báo khi trang bị ẩn, ví dụ chuyển tab hoặc thu nhỏ cửa sổ. Sự kiện này không chứng minh người học đang tra đáp án. Tín hiệu có thể thiếu khi mất mạng hoặc người dùng can thiệp trình duyệt. Thao tác chuột phải cũng có thể hoàn toàn bình thường. Cần xem xét tình huống và trao đổi với người học.

Chặn chọn/copy chỉ là hạn chế ở giao diện ([MDN về user-select](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/user-select)); không thể bảo đảm chống chụp màn hình, đọc bằng công cụ trình duyệt, điện thoại thứ hai hoặc nhờ người khác. Không thu webcam, không theo dõi ứng dụng khác và không xác thực danh tính sinh viên.

Để dùng trong lớp, nên mở phòng có thời gian phù hợp, bắt đầu khi đủ người, dùng ngân hàng lớn và nhiều câu vận dụng. Hệ thống đã hỗ trợ lấy ngẫu nhiên từ chương khi tạo bài/quiz. Nếu cần tổ chức kiểm tra chính thức, các bước tiếp theo có thể là bộ đề riêng chưa công khai, thời gian mở/đóng kỳ kiểm tra, giới hạn lượt theo danh sách sinh viên được xác thực, và quy trình xem xét bất thường. Những chức năng thi chính thức này **chưa triển khai** trong lần cập nhật; chế độ hiện tại vẫn ưu tiên ôn tập và chơi cùng lớp.
