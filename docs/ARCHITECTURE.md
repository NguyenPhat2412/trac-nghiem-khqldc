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
- `/attempts/{id}/integrity`, `/rooms/{code}/integrity`: ghi nhận tín hiệu tập trung theo actor hiện tại, kiểm tra quyền/thời hạn và giới hạn tần suất.
- `/rooms/{code}`, `/rooms/{code}/join`, `/rooms/{code}/answer`: người chơi.
- `/admin/rooms`, `/admin/rooms/{code}/{start|next|lock|kick|finish}`: chủ trì.
- `/admin/chapters`, `/admin/questions`, `/admin/quizzes`: nội dung.
- `/admin/import/{template|preview|commit}`: nhập Excel có giao dịch.
- `/admin/report`, `/admin/report.csv`, `/admin/staff`: báo cáo và nhân sự.

Question snapshot giữ nguyên nội dung/đáp án trong attempt và room, dù ngân hàng được sửa sau đó. Các API làm bài xếp hạng đang mở không trả đáp án đúng/lời giải; bài học `instantFeedback` chỉ mở lời giải của câu đã trả lời và khóa lựa chọn đầu tiên ở máy chủ. Các lượt học này không được xếp hạng. Kết quả riêng kiểm tra actor ID; tên không được dùng để cấp quyền.

## Thứ tự đáp án và tín hiệu tập trung

Phòng mới lấy cờ `shuffle` từ quiz. Thứ tự câu được đảo chung; hoán vị đáp án được tạo ổn định từ `Member.optionSeed` riêng và mã câu hỏi. `Member.optionOrders` cũ vẫn được ưu tiên để giữ lịch sử. Máy chủ ánh xạ lựa chọn hiển thị về chỉ số chuẩn trước khi lưu/chấm, rồi ánh xạ ngược khi trả đáp án/phân bố/review. Phòng cũ thiếu trường này dùng thứ tự chuẩn để giữ tương thích.

`Integrity` lưu tối đa 100 sự kiện có mã riêng cùng thời gian nhận máy chủ, gộp sự kiện gửi lại. Tổng hợp chỉ trả cho chủ trì hoặc báo cáo có quyền; không sửa điểm/thứ hạng. Sự kiện là dữ liệu do trình duyệt tự báo, không phải bằng chứng gian lận.

Các loại tín hiệu gồm TAB_HIDDEN, COPY_BLOCKED và FULLSCREEN_EXIT. CSV báo cáo xuất ba số lượng cùng cờ capped; dữ liệu cũ thiếu tín hiệu được xuất 0. Các kiểm tra quyền và bộ lọc báo cáo giữ nguyên.

## Trải nghiệm chơi

GameProvider quản lý tùy chọn âm thanh/hiệu ứng/phím tắt và trạng thái mạng ở frontend. Web Audio chỉ được dùng khi bật âm thanh; không thêm thư viện hoặc tải âm thanh ngoài. CSS xử lý chuyển câu, phản hồi và tổng kết, tôn trọng reduced motion. Fullscreen là yêu cầu trực tiếp từ nút của người dùng, không khóa phím hệ điều hành.

Practice giữ số thứ tự thay đổi cục bộ để bỏ phản hồi đọc cũ đến sau lệnh lưu mới; trạng thái DONE không bị phản hồi ACTIVE ghi đè. Room tiếp tục dùng version máy chủ. Không lưu đáp án chưa gửi offline rồi gửi muộn; máy chủ vẫn áp dụng deadline. Đồng hồ frontend thông báo hết giờ một lần cho mỗi deadline, tránh vòng lặp gửi nộp khi lỗi mạng.

## Vận hành

`/actuator/health` báo sức khỏe. Dữ liệu chính nằm trên ổ D qua bind mount; không chứa trong image. Bản local bind cổng vào loopback. Bản công khai cần TLS và APP_ORIGIN/SECURE_COOKIE tương ứng. Sao lưu PostgreSQL bằng pg_dump; trước nâng cấp schema, lưu bản sao và kiểm thử khôi phục trên database riêng.

## Trạng thái phòng nhỏ và lịch sử tách riêng (schema V4)

`RoomPersistence` lưu ba phần trong cùng PostgreSQL:

- `rooms.data`: trạng thái, phiên bản, deadline, thành viên, đáp án của câu hiện tại, điểm/thời gian tích lũy của các câu trước. Câu hỏi và lịch sử trả lời không tăng kích thước hàng này theo số câu.
- `room_snapshots`: bản quiz cố định theo mã phòng; không thay đổi khi sửa ngân hàng hoặc xuất bản phiên bản quiz mới.
- `room_history`: các lựa chọn và thời gian đã lưu trước đó theo `(room_id, player_id)`; chỉ cần tải khi xem chi tiết cuối bài hoặc báo cáo.

Khi chủ trì mở câu tiếp, hệ thống lưu câu cũ vào lịch sử, cộng điểm/thời gian (câu bỏ trống tính đủ thời lượng), xóa lựa chọn hiện tại rồi mở câu mới. Tất cả nằm trong giao dịch đang giữ khóa phòng. Khi chuyển sang FINISHED, câu cuối vẫn nằm trong trạng thái phòng; đọc kết quả ghép lịch sử với câu cuối. Khóa hàng, phiên bản, deadline, lựa chọn đầu tiên và phát sự kiện sau commit vẫn giữ nguyên.

Bảng xếp hạng tính từ tổng tích lũy và câu hiện tại, không duyệt lại toàn bộ bài cho mỗi người. GET phòng vẫn đọc trạng thái và kiểm tra quyền từ database; chỉ tải lịch sử của đúng sinh viên khi họ xem kết quả. Chủ trì/báo cáo được cấp quyền mới tải lịch sử nhiều người. DTO công khai vẫn được tạo riêng theo actor; không đưa khóa đáp án, hoán vị bí mật, tổng nội bộ hay đáp án người khác vào cache HTTP.

Cache trong tiến trình chỉ chứa quiz snapshot cố định, tối đa 128 phòng và ngân sách trọng số 32 MiB (ước lượng theo kích thước JSON, không phải giới hạn chính xác toàn bộ heap). Cache không chứa phiên, tư cách thành viên, lựa chọn hay DTO kết quả. Snapshot mới chỉ được đưa vào cache sau commit và tách khỏi đối tượng mà lệnh tạo phòng có thể sửa. Sau restart hoặc eviction, cache đọc lại PostgreSQL. Vì snapshot không đổi, không cần TTL hay invalidation theo chỉnh sửa ngân hàng.

Phòng từ schema cũ vẫn đọc được. Lệnh đầu tiên giữ khóa phòng chuyển đổi aggregate cũ trong một giao dịch, bảo toàn snapshot, thứ tự đáp án, thời gian, điểm, phiên bản và lịch sử. Giao dịch bị từ chối phải rollback cả việc chuyển đổi. Phòng đã hoàn tất từ bản cũ chưa được sửa có thể tiếp tục đọc theo định dạng cũ.

Sau khi đã chuyển đổi phòng, **không chỉ đổi về image cũ**: phiên bản cũ không hiểu định dạng compact. Muốn quay lui bản phát hành phải dừng dịch vụ và khôi phục backup database trước nâng cấp cùng image tương ứng; dữ liệu phát sinh sau backup cần được xử lý riêng. Kiểm thử restore trên database riêng trước khi thao tác dữ liệu chính.

## Từ chối kết nối mà không tạo vòng lặp

Lỗi quyền/phiên ở STOMP đóng transport bằng 1008, loại frame khỏi kênh và ghi audit chỉ gồm command, mã socket và loại lỗi. Không ném lại ngoại lệ chứa frame CONNECT để Spring ghi token vào log. Lỗi máy chủ tạm thời đóng bằng 1011 để client vẫn được nối lại. Frontend dừng polling, timer làm mới và reconnect sau 1008; bỏ qua phản hồi đang chờ để không ghi đè thông báo. Tải lại trang lấy phiên hiện tại. Các giới hạn socket, subscription và kiểm tra CSRF/thành viên giữ nguyên.

## Gom đáp án đồng thời, giữ xác nhận sau commit

`RoomAnswers` nhận lệnh đã qua phiên và CSRF, gom trong cửa sổ 10 ms theo mã phòng. Một phòng chỉ có một đợt đang xử lý; bốn worker phục vụ các phòng. Mỗi đợt gọi `RoomService.answerBatch` qua proxy giao dịch Spring: đọc và khóa phòng một lần, kiểm tra từng người/câu/hạn giờ, giữ lựa chọn đầu tiên, lưu một lần và phát một sự kiện sau commit. Chỉ khi proxy hoàn tất commit mới trả kết quả HTTP qua `CompletableFuture`. Không dùng bộ nhớ làm nguồn dữ liệu chính hoặc trả thành công trước khi lưu.

Đáp án sai định dạng, ngoài quyền hoặc quá hạn được trả lỗi riêng; không làm mất các đáp án hợp lệ trong cùng đợt. Nếu cả đợt bị từ chối, rollback cả chuyển đổi phòng cũ. Nếu lưu/commit thất bại, mọi lệnh trong đợt thất bại. Câu chỉ được công bố đáp án khi trạng thái đã chuyển REVEAL/FINISHED, và chi tiết vẫn được dựng theo từng người. Thời gian trả lời lấy lúc máy chủ nhận lệnh đã xác thực, loại trừ khoảng đợi gom; lệnh nhận trước lúc mở câu hoặc xử lý sau hạn đều bị từ chối.

Hàng đợi giới hạn 1.024 người đang chờ trên toàn backend, 128 phòng, 100 người/phòng. Gửi lặp cùng người và câu đang lưu dùng chung kết quả của lựa chọn đầu tiên, giới hạn 32 phản hồi chờ/lệnh để tránh mở vô hạn lượt chờ; hủy một kết nối không hủy việc lưu hoặc phản hồi của lần gửi lại. API giới hạn 240 lần gửi/phút/mã người chơi. Khi đầy trả 429; khi dừng máy chủ, yêu cầu chưa có xác nhận nhận lỗi và phải kết nối lại để đối chiếu trạng thái đã lưu. Số phiên bản tăng theo giao dịch thay đổi trạng thái, không phải số yêu cầu HTTP; frontend vốn xử lý phiên bản tăng đơn điệu và tự đọc lại khi nối mạng.

Không đổi schema V4, không tắt `fsync`/`synchronous_commit`; bản nâng cấp này có thể quay lại backend V4 trước đó mà không đổi định dạng dữ liệu. Vẫn cần backup trước triển khai. Mô hình triển khai được kiểm thử là một backend; khóa PostgreSQL bảo vệ dữ liệu nhưng chưa đo SLO cho nhiều backend hoặc nhiều phòng đầy đồng thời.

Đọc phòng khi hết giờ dùng `FOR UPDATE SKIP LOCKED` kèm điều kiện QUESTION/deadline. Chỉ yêu cầu lấy được khóa mới chuyển trạng thái; các yêu cầu khác đọc lại trạng thái đã commit và nhận sự kiện sau commit. Không trả khóa đáp án khi giao dịch đóng câu chưa hoàn tất. Việc đọc không còn xếp hàng để mỗi người lần lượt khóa cùng một hàng chỉ để phát hiện người trước đã đóng câu. Có chẩn đoán tùy chọn `APP_PROFILE_ROOM_READS=true` ghi thời lượng đọc chậm từ 100 ms, không ghi tên, cookie, token hoặc nội dung đáp án; mặc định tắt.

## Xác nhận đọc lời giải

`POST /rooms/{code}/ready` chỉ ghi tín hiệu của chính thành viên đang hoạt động, khi phòng ở REVEAL và questionId khớp câu hiện tại. Gửi lặp không tăng phiên bản hoặc thay đổi điểm/thời gian; yêu cầu cũ không đánh dấu câu mới. `myReady` thuộc người đang xem; danh sách `readyPlayers` chỉ gửi cho chủ trì. Endpoint này không chuyển câu và không cấp quyền chủ trì. Phòng bình thường tiếp tục dùng thao tác next của chủ trì.

Phòng trải nghiệm cục bộ từ `python3 scripts/demo-room.py` có ba người chơi minh họa và người chủ trì tự động chờ tất cả người thật bấm “Đã đọc xong”. Không còn tự chuyển sau 12 giây; câu cuối cũng chờ xác nhận trước tổng kết. Giữ tiến trình chạy trong khi trải nghiệm (tối đa 4 giờ); script không tự chọn đáp án của người thật. Bộ quiz thử được lưu trữ ngay sau tạo phòng để không thêm vào thư viện công khai.
