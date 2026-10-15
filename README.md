# VJU Quiz

Website tiếng Việt để ôn tập Khoa học quản lý đại cương và chơi quiz đồng bộ theo lớp. Sinh viên chỉ nhập tên; người quản lý đăng nhập để biên soạn nội dung và chủ trì phòng.

## Chạy bằng Docker

Yêu cầu Docker Desktop/Engine có Docker Compose. Tại thư mục dự án:

```sh
./scripts/start.sh
```

- Website: http://localhost:3000
- Quản trị: http://localhost:3000/admin
- Tài khoản ban đầu lấy từ `ADMIN_USERNAME` (mặc định `admin`). Mật khẩu được tạo riêng trong `.env`, trường `ADMIN_PASSWORD`.
- `ADMIN_USERNAME` và `ADMIN_PASSWORD` chỉ được dùng khi cơ sở dữ liệu chưa có nhân sự. Sau đó đổi mật khẩu trong giao diện Quản trị → Đổi mật khẩu.
- Dừng: `docker compose stop`. Chạy lại: `docker compose up -d`.
- Dữ liệu PostgreSQL nằm trong `data/postgres/` của dự án trên ổ D. Không cần đăng ký dịch vụ ngoài.
- Chạy `./scripts/backup.sh` để tạo bản sao vào `backups/`.

Bản local chỉ mở cổng trên `127.0.0.1`. Thiết bị khác chưa truy cập được bằng địa chỉ localhost của máy này.

## Tính năng

Giao diện đã được nâng cấp với thẻ đáp án lớn, hiệu ứng đúng/sai, chuyển câu, bục xếp hạng, âm thanh tùy chọn, phím 1–4 và toàn màn hình. Có hỗ trợ giảm chuyển động, thông báo mất mạng và đồng bộ lại bài. Xem [bản cập nhật UI/UX](docs/UX_UPGRADE.md).

- Nhập tên và nhận mã người chơi qua cookie HttpOnly; không có đăng ký sinh viên.
- Chương, ngân hàng câu hỏi, độ khó, hình ảnh bằng liên kết HTTPS, lời giải; nháp/xuất bản/lưu trữ.
- Bộ quiz có phiên bản và danh sách câu hỏi cố định; sửa bản đã xuất bản tạo bản mới. Lưu nháp bản mới giữ bản đang công khai; xuất bản bản mới lưu trữ bản cũ.
- Tự luyện bộ quiz hoặc chọn chương/số câu/thời gian; đảo câu và đáp án; đánh dấu, tự lưu, tiếp tục sau tải lại, tự nộp khi hết giờ.
- Học từng câu: hiện đáp án và lời giải ngay sau lựa chọn đầu tiên, khóa sửa đáp án, không xếp hạng. Chế độ có xếp hạng chỉ hiện lời giải sau khi nộp.
- Kết quả, lời giải, lịch sử tự luyện, luyện lại câu sai, bảng xếp hạng theo phiên bản quiz.
- Phòng 6 số, liên kết/QR, phòng chờ, khóa/loại người chơi, chủ trì mở từng câu, khóa lựa chọn, đóng câu khi hết giờ hoặc mọi người trả lời.
- Khi bật đảo câu/đáp án ở quiz, phòng dùng cùng câu hỏi nhưng mỗi người có thứ tự A–D riêng, được giữ khi kết nối lại.
- Hạn chế thao tác sao chép, ghi tên/mã trên vùng câu hỏi, tạm ẩn nội dung khi trang bị ẩn, ghi nhận rời trang và thoát toàn màn hình khi làm bài có xếp hạng hoặc chơi phòng. Người có quyền xem tín hiệu trong phòng/báo cáo và CSV; không tự trừ điểm hay kết luận gian lận.
- Xếp hạng sau từng câu, phân bố lựa chọn, top 3, kết thúc sớm và báo cáo chi tiết; khôi phục sau mất mạng và khởi động lại backend.
- Nhập Excel có mẫu, xem trước, chỉnh sửa lỗi theo dòng, giao dịch nhập toàn bộ hoặc không nhập.
- Báo cáo theo ngày/chương/quiz/phòng; xuất CSV; nhân sự ADMIN/EDITOR và khóa tài khoản.

## Học liệu

Bản local hiện có **8 chương, 800 câu và 9 bộ quiz**: mỗi chương đúng 100 câu; gồm 18 câu Blooket, 50 câu CSV Nhóm 7 và 732 câu tự biên soạn theo giáo trình 2019. Nguồn được ghi trong lời giải. Bộ Nhóm 7 nằm ở chương 3 và có quiz riêng. Đây chưa phải ngân hàng đề thi chính thức hoặc bao quát toàn bộ giáo trình. Xem [học liệu và chế độ tập trung](docs/MATERIALS_AND_FAIR_PLAY.md).

Database mới vẫn có dữ liệu minh họa nếu `SEED_DEMO=true`. Để nạp ngân hàng 800 câu đã bàn giao sau khi ứng dụng chạy, đặt thông tin quản trị hiện hành trong `.env` rồi chạy `python3 scripts/import-course.py`. Script dùng API quản trị, có thể chạy lại mà không tạo trùng; xuất bản phiên bản mới cho 8 quiz chương, lưu trữ dữ liệu minh họa và 4 câu cơ bản gần trùng CSV, giữ lịch sử. Dữ liệu nguồn chuẩn hóa nằm tại `content/course-2019.json`.

Màu xanh/đỏ và chữ VJU được dùng theo yêu cầu thiết kế; chưa xác nhận là bộ nhận diện chính thức.

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
- Kiểm tra phản hồi và thứ tự đáp án riêng: khi test-backend đang chạy, `python3 scripts/fair-play_test.py`.
- Kiểm tra đường dẫn mã hóa, quyền và thời điểm lộ đáp án: `python3 scripts/security-regression.py` (database test).
- Kiểm tra giới hạn theo IP, chống giả header và proxy: `python3 scripts/proxy-security-test.py`. Tạo rồi tự dọn một backend/gateway riêng dùng database test; cần hai image đã build. Không gửi yêu cầu vào backend đang phục vụ người học.
- Trình duyệt: nạp `.env`, `cd frontend && pnpm exec playwright test`. Cấu hình dùng Chrome; cài Google Chrome hoặc đổi channel theo môi trường. Các bài test tạo dữ liệu minh họa trong bản local.
- WebSocket: sau khi test-backend sẵn sàng, nạp `.env`, `cd frontend && node tests/realtime-check.mjs`. Tránh chạy liên tục vượt 150 phiên khách/phút trên cùng IP.
- Phục hồi: sau WebSocket test, `docker compose --profile test restart test-backend`, chờ health sẵn sàng, rồi `cd frontend && node tests/restart-check.mjs`.
- Kết quả và ảnh chụp ở `work/`; hướng dẫn và báo cáo bàn giao trong `docs/`.

## Đưa lên máy chủ

Dùng một máy chủ chạy Docker, trỏ tên miền, đặt HTTPS reverse proxy phía trước cổng local 3000. Đổi `APP_ORIGIN=https://ten-mien-cua-ban`, `SECURE_COOKIE=true`, và `SEED_DEMO=false` trước lần tạo database chính thức. Giữ chuyển tiếp WebSocket Upgrade và cùng origin cho `/api` và `/ws`. Không công khai cổng PostgreSQL. Khởi động lại backend khi thay origin/cookie.

Backend Docker chỉ tin địa chỉ proxy của gateway trên mạng `ingress`; gateway ghi đè các header địa chỉ do client gửi. Mạng mặc định dùng `172.30.42.0/24`, cấp động từ `172.30.42.128/25`, gateway cố định `172.30.42.2`. Nếu trùng mạng máy chủ, đặt đồng bộ `QUIZ_INGRESS_SUBNET`, `QUIZ_INGRESS_RANGE`, `QUIZ_GATEWAY_IP` trong `.env`; IP gateway phải thuộc subnet và nằm ngoài dải cấp động. Không công khai cổng backend hoặc chuyển sang tin mọi địa chỉ private/loopback. Backend native và test mặc định không tin header chuyển tiếp.

Nếu thêm HTTPS proxy phía trước, sao chép `deploy/trusted-proxy/edge.conf.example` thành `edge.conf` cùng thư mục rồi thay địa chỉ minh họa bằng **đúng IP/CIDR proxy đó mà gateway nhìn thấy**. Nginx tự nạp các tệp `.conf` trong thư mục này; chạy `docker compose exec gateway nginx -t` và `docker compose exec gateway nginx -s reload` sau khi sửa. Proxy ngoài phải ghi đè `X-Forwarded-For` bằng IP khách đã xác minh, giữ WebSocket Upgrade và chỉ cho proxy đó kết nối cổng gateway. Nếu chưa khai báo trust này, các người dùng qua proxy ngoài vẫn chung hạn mức của proxy. Không dùng `set_real_ip_from 0.0.0.0/0`. Kiểm tra lại hai IP khách thật sau triển khai. Người dùng cùng một IP công cộng (ví dụ cùng Wi-Fi/NAT) vẫn dùng chung hạn mức IP; bản sửa tách người có IP khác nhau, không xác thực danh tính sinh viên.

Sau triển khai, kiểm tra health, đăng nhập quản trị, tạo phòng và tham gia bằng một thiết bị khác. Chưa triển khai tên miền công khai trong lần bàn giao này.

## Giới hạn đã chọn

Tên là tự khai; mã người chơi thuộc trình duyệt, không xác thực sinh viên. Xóa cookie hoặc đổi thiết bị tạo người chơi mới. Đây là hệ thống ôn tập, không thay thế cơ chế định danh/giám sát kỳ thi. Các lượt làm và dữ liệu phòng được giữ lại; quản trị viên quản lý sao lưu và thời gian lưu trữ theo nhu cầu. Tối đa 100 người/phòng, 100 câu/quiz; một backend cho môi trường hiện tại.

### Giới hạn tài nguyên và bộ nhớ đệm

- Danh mục công khai dùng một bản tóm tắt bất biến trong bộ nhớ, tối đa 15 giây; thêm/sửa/xuất bản nội dung xóa hiệu lực cache sau khi giao dịch hoàn tất. Cache không chứa câu hỏi, đáp án, phiên hay dữ liệu người chơi. Bài đang làm, phòng và báo cáo vẫn trả `no-store` và kiểm tra quyền từng yêu cầu.
- Mỗi người có tối đa 5 bài đang làm; có thể vào Lịch sử để tiếp tục/nộp. Bài có giờ đã hết hạn không chiếm hạn mức. Tạo bài còn chịu giới hạn bền vững theo địa chỉ nguồn đã xác thực: 200/phút, 5.000/ngày; toàn máy chủ: 600/phút, 20.000/ngày. Đổi cookie hoặc khởi động lại không xóa hạn mức. Cửa sổ cố định tính theo giờ máy chủ; đây là giới hạn tốc độ tăng dữ liệu, không phải hạn mức dung lượng lưu trữ. Kết quả cũ không bị tự xóa; cần theo dõi dung lượng và lập chính sách lưu trữ khi triển khai lâu dài.
- Phòng chứa 100 thành viên đang tham gia. Loại người chơi trả lại chỗ nhưng giữ mã bị chặn; tối đa 1.000 mã bị chặn/phòng, sau đó cần phòng mới. Danh tính khách vẫn tự khai: nếu có người liên tục tạo danh tính mới, chủ trì nên khóa phòng sau khi đủ lớp.
- WebSocket tối đa 4 kết nối/người và 512 kết nối/máy chủ, 2 đăng ký/kết nối, không đăng ký trùng phòng; 60 lệnh/phút/kết nối. Đóng kết nối giải phóng hạn mức. Thông báo chỉ chứa mã phòng, phiên bản và giờ; trình duyệt gộp thông báo dồn dập trong 120 ms rồi lấy trạng thái có phân quyền.
- Thứ tự đáp án mới được tạo ổn định bằng mã ngẫu nhiên riêng từng người, giảm kích thước trạng thái phòng. Phòng cũ giữ nguyên thứ tự đã lưu. Ảnh câu hỏi tải ưu tiên và giải mã bất đồng bộ; cache ảnh vẫn phụ thuộc HTTP header của nơi lưu ảnh. Không có proxy tải URL tùy ý từ máy chủ. Nên dùng nguồn ảnh HTTPS do đơn vị quản lý, tên tệp có phiên bản và cache dài hạn.
- Kiểm tra bổ sung trên **cơ sở dữ liệu thử**: `python3 scripts/resource-security-test.py`, `python3 scripts/room-load-test.py after`, và trong `frontend`: `node tests/resource-ws-check.mjs`. Chạy riêng từng bài tải 100 người; khởi động lại test-backend giữa các nhóm để không chạm hạn mức tạo phiên khách. Bài kiểm tra resource-security chủ động sửa bảng hạn mức của `vju_quiz_test`, không dùng với cơ sở dữ liệu thật.
