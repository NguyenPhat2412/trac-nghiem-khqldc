"use client";
import { useState } from "react";
import { useLoad } from "@/lib/use-load";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  FileQuestion,
  Layers,
  Users,
  BarChart3,
  Radio,
  LogOut,
  Lock,
  Plus,
} from "lucide-react";
import { api, statusLabel, date } from "@/lib/api";
import { Actor, Quiz, Room, RoomSummary } from "@/lib/types";
import { ErrorNote, Loading, PageTitle, Empty, useSession } from "./shared";
import {
  ChaptersAdmin,
  QuestionsAdmin,
  QuizzesAdmin,
  ImportAdmin,
} from "./content-admin";
import { ReportAdmin, StaffAdmin } from "./reports-admin";
export function Admin() {
  const { actor, ready, refresh } = useSession();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const path = usePathname();
  if (!ready) return <Loading />;
  if (!actor || actor.role === "GUEST")
    return (
      <section className="login">
        <div className="login-mark">
          <Lock size={28} />
        </div>
        <h1>Không gian quản lý</h1>
        <p>Đăng nhập để chuẩn bị câu hỏi và kết nối lớp học.</p>
        <ErrorNote error={error} />
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api<Actor>("/auth/login", "POST", { username, password });
              await refresh();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Tên đăng nhập
            <input
              required
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
          <label>
            Mật khẩu
            <input
              required
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button className="button wide" disabled={busy}>
            {busy ? "Đang đăng nhập…" : "Đăng nhập"}
          </button>
        </form>
        <small>Sinh viên chỉ cần nhập tên ở trang chủ.</small>
      </section>
    );
  const items = [
    ["/admin", "Tổng quan", BarChart3],
    ["/admin/chapters", "Chương học", BookOpen],
    ["/admin/questions", "Ngân hàng câu hỏi", FileQuestion],
    ["/admin/quizzes", "Bộ quiz", Layers],
    ["/admin/import", "Nhập Excel", Plus],
    ["/admin/rooms", "Phòng chơi", Radio],
    ["/admin/reports", "Báo cáo", BarChart3],
    ...(actor.role === "ADMIN" ? [["/admin/staff", "Tài khoản", Users]] : []),
    ["/admin/password", "Đổi mật khẩu", Lock],
  ] as const;
  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <div className="admin-profile">
          <span className="avatar">{actor.name.charAt(0)}</span>
          <div>
            <strong>{actor.name}</strong>
            <small>
              {actor.role === "ADMIN" ? "Quản trị viên" : "Biên tập viên"}
            </small>
          </div>
        </div>
        <nav>
          {items.map(([href, label, Icon]) => (
            <Link
              key={href as string}
              href={href as string}
              className={path === href ? "active" : ""}
            >
              {typeof Icon !== "string" && <Icon size={19} />} {label as string}
            </Link>
          ))}
        </nav>
        <button
          className="button ghost"
          onClick={async () => {
            await api("/auth/logout", "POST", {});
            await refresh();
          }}
        >
          <LogOut size={18} />
          Đăng xuất
        </button>
      </aside>
      <section className="admin-main">
        {path === "/admin/chapters" ? (
          <ChaptersAdmin />
        ) : path === "/admin/questions" ? (
          <QuestionsAdmin />
        ) : path === "/admin/quizzes" ? (
          <QuizzesAdmin />
        ) : path === "/admin/import" ? (
          <ImportAdmin />
        ) : path === "/admin/rooms" ? (
          <RoomsAdmin />
        ) : path === "/admin/staff" ? (
          <StaffAdmin />
        ) : path === "/admin/password" ? (
          <PasswordAdmin />
        ) : (
          <ReportAdmin overview={path === "/admin"} />
        )}
      </section>
    </div>
  );
}
function RoomsAdmin() {
  const rooms = useLoad<RoomSummary[]>("/admin/rooms", []);
  const quizzes = useLoad<Quiz[]>("/admin/quizzes", []);
  const [quiz, setQuiz] = useState("");
  const [untimed, setUntimed] = useState(false);
  const [advanceWhenReady, setAdvanceWhenReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <>
      <PageTitle
        title="Phòng chơi"
        subtitle="Tạo một cuộc hẹn kiến thức cho cả lớp."
      />
      <ErrorNote error={rooms.error || quizzes.error} />
      <form
        className="room-create-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          try {
            const r = await api<Room>("/admin/rooms", "POST", {
              quizId: quiz,
              untimed,
              advanceWhenReady,
            });
            router.push("/room/" + r.id);
          } catch (e) {
            rooms.setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Bộ quiz
          <select
            required
            value={quiz}
            onChange={(e) => setQuiz(e.target.value)}
          >
            <option value="">Chọn bộ quiz đã xuất bản</option>
            {quizzes.data
              .filter((q) => q.status === "PUBLISHED")
              .map((q) => (
                <option value={q.id} key={q.id}>
                  {q.title} · v{q.version}
                </option>
              ))}
          </select>
        </label>
        <fieldset className="room-create-options" disabled={busy}>
          <legend>Cách chơi</legend>
          <div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={untimed}
                onChange={(e) => setUntimed(e.target.checked)}
                aria-describedby="untimed-help"
              />
              Không giới hạn thời gian trả lời
            </label>
            <p id="untimed-help" className="muted">
              {untimed
                ? "Người chơi đọc kỹ và trả lời theo nhịp của mình. Không có đồng hồ đếm ngược."
                : "Mỗi câu dùng thời gian đã cấu hình trong bộ quiz."}
            </p>
          </div>
          <div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={advanceWhenReady}
                onChange={(e) => setAdvanceWhenReady(e.target.checked)}
                aria-describedby="ready-help"
              />
              Người chơi bấm chuyển câu sau lời giải
            </label>
            <p id="ready-help" className="muted">
              {advanceWhenReady
                ? "Cả phòng chuyển khi tất cả người chơi bấm “Đã đọc xong”. Chơi một mình thì bấm là chuyển. Chủ trì vẫn có thể chuyển thủ công."
                : "Chủ trì chuyển câu; nút “Đã đọc xong” của người chơi chỉ báo sẵn sàng."}
            </p>
          </div>
        </fieldset>
        <button className="button" disabled={busy || !quiz}>
          <Plus size={18} />
          Tạo phòng mới
        </button>
      </form>
      {rooms.loading ? (
        <Loading />
      ) : !rooms.data.length ? (
        <Empty>Chưa có phòng chơi. Tạo phòng đầu tiên cho lớp nhé.</Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Mã phòng</th>
                <th>Bộ quiz</th>
                <th>Người chơi</th>
                <th>Trạng thái</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rooms.data.map((r) => (
                <tr key={r.id}>
                  <td>
                    <b>{r.id}</b>
                    <small>{date(r.createdAt)}</small>
                  </td>
                  <td>{r.title}</td>
                  <td>{r.players}</td>
                  <td>
                    <span className="badge">{statusLabel(r.status)}</span>
                  </td>
                  <td>
                    <Link
                      href={"/room/" + r.id}
                      className="button outline small"
                    >
                      Mở phòng
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
function PasswordAdmin() {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  return (
    <>
      <PageTitle title="Đổi mật khẩu" />
      <ErrorNote error={error} />
      {done && (
        <p className="success">
          Đã đổi mật khẩu. Những phiên khác đã đăng xuất.
        </p>
      )}
      <form
        className="editor-form"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api("/auth/password", "POST", { current, password });
            setDone(true);
            setCurrent("");
            setPassword("");
            setError("");
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <label>
          Mật khẩu hiện tại
          <input
            type="password"
            required
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </label>
        <label>
          Mật khẩu mới (ít nhất 12 ký tự)
          <input
            type="password"
            required
            minLength={12}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button className="button">Lưu mật khẩu</button>
      </form>
    </>
  );
}
