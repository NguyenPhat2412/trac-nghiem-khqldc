"use client";
import { useEffect, useState } from "react";
import { Download, Plus, Users, Target, BarChart3 } from "lucide-react";
import { api, date, duration } from "@/lib/api";
import { Report, Staff, Chapter, Quiz } from "@/lib/types";
import { ErrorNote, Loading, PageTitle, Empty, useSession } from "./shared";
import { useLoad } from "@/lib/use-load";
export function ReportAdmin({ overview }: { overview: boolean }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [chapter, setChapter] = useState("");
  const [quiz, setQuiz] = useState("");
  const [room, setRoom] = useState("");
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const chapters = useLoad<Chapter[]>("/admin/chapters", []);
  const quizzes = useLoad<Quiz[]>("/admin/quizzes", []);
  const { actor } = useSession();
  useEffect(() => {
    setRoom(new URLSearchParams(location.search).get("room") || "");
  }, []);
  const params = new URLSearchParams({
    from: String(from ? new Date(from + "T00:00:00").getTime() : 0),
    to: String(
      to ? new Date(to + "T23:59:59.999").getTime() : "9223372036854775807",
    ),
    chapter,
    quiz,
    room,
  }).toString();
  useEffect(() => {
    let cancelled = false;
    api<Report>("/admin/report?" + params)
      .then((r) => {
        if (!cancelled) {
          setData(r);
          setError("");
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [params]);
  return (
    <>
      <PageTitle
        title={overview ? "Nhịp học tập hôm nay" : "Thống kê & báo cáo"}
        subtitle={
          actor?.role === "ADMIN"
            ? "Góc nhìn tổng quan về hoạt động học tập."
            : "Kết quả các phòng chơi bạn chủ trì."
        }
      >
        <a href={"/api/admin/report.csv?" + params} className="button outline">
          <Download size={18} />
          Xuất CSV
        </a>
      </PageTitle>
      <ErrorNote error={error} />
      <div className="filter-bar report-filter">
        <label>
          Từ ngày
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          Đến ngày
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label>
          Chương
          <select value={chapter} onChange={(e) => setChapter(e.target.value)}>
            <option value="">Tất cả</option>
            {chapters.data.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Bộ quiz
          <select value={quiz} onChange={(e) => setQuiz(e.target.value)}>
            <option value="">Tất cả</option>
            {quizzes.data.map((q) => (
              <option key={q.id} value={q.id}>
                {q.title} · v{q.version}
              </option>
            ))}
          </select>
        </label>
        <label>
          Mã phòng
          <input
            value={room}
            maxLength={6}
            placeholder="Tất cả"
            onChange={(e) => setRoom(e.target.value)}
          />
        </label>
      </div>
      {!data ? (
        <Loading />
      ) : (
        <>
          <div className="stats">
            <div>
              <BarChart3 size={23} />
              <span>Lượt hoàn thành</span>
              <strong>{data.total}</strong>
            </div>
            <div>
              <Users size={23} />
              <span>Người chơi theo mã</span>
              <strong>{data.players}</strong>
            </div>
            <div>
              <Target size={23} />
              <span>Điểm trung bình</span>
              <strong>
                {data.average.toFixed(1)}
                <small>/100</small>
              </strong>
            </div>
          </div>
          <div className="report-panels">
            <section className="panel">
              <h2>Chương được luyện tập</h2>
              <p className="muted">Số lượt trả lời câu hỏi theo chương</p>
              {data.chapters.map((c) => (
                <div className="bar-row" key={c.title}>
                  <span>{c.title}</span>
                  <div>
                    <span
                      style={{
                        width: `${Math.max(...data.chapters.map((x) => x.count), 1) ? (c.count / Math.max(...data.chapters.map((x) => x.count), 1)) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <b>{c.count}</b>
                </div>
              ))}
            </section>
            <section className="panel">
              <h2>Câu cần ôn tập thêm</h2>
              {data.questions.length === 0 ? (
                <p className="muted">Chưa có dữ liệu trả lời.</p>
              ) : (
                data.questions.slice(0, 5).map((q) => (
                  <div className="question-stat" key={q.id}>
                    <strong>{q.text}</strong>
                    <small>
                      {q.count ? Math.round((q.wrong / q.count) * 100) : 0}% sai
                      · {q.count} lượt trả lời
                      {q.averageMs > 0
                        ? ` · ${duration(q.averageMs)} trung bình trong phòng`
                        : ""}
                    </small>
                  </div>
                ))
              )}
            </section>
          </div>
          <h2 className="section-label">Kết quả chi tiết</h2>
          {data.rows.length === 0 ? (
            <Empty>Chưa có kết quả trong khoảng thời gian đã chọn.</Empty>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Người chơi</th>
                    <th>Bài quiz</th>
                    <th>Điểm</th>
                    <th>Thời gian</th>
                    <th>Hoàn thành</th>
                    <th>Ghi nhận tập trung</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r, i) => (
                    <tr key={i}>
                      <td>
                        <strong>{r.name}</strong>
                        <small>#{r.playerId.slice(0, 6)}</small>
                      </td>
                      <td>
                        {r.title}
                        <small>
                          {r.mode}
                          {r.roomId ? " · " + r.roomId : ""}
                        </small>
                      </td>
                      <td>
                        <b>{Number(r.score).toFixed(2)}</b>
                      </td>
                      <td>{duration(r.durationMs)}</td>
                      <td>{date(r.date)}</td>
                      <td>
                        {r.integrity ? (
                          <small>
                            {r.integrity.tabHidden} lần rời trang ·{" "}
                            {r.integrity.copyBlocked} thao tác sao chép
                            {r.integrity.capped ? " · ≥100 sự kiện" : ""}
                          </small>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
export function StaffAdmin() {
  const { actor } = useSession();
  const state = useLoad<Staff[]>("/admin/staff", []);
  const [form, setForm] = useState({
    username: "",
    name: "",
    password: "",
    role: "EDITOR",
    enabled: true,
  });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  async function update(s: Staff) {
    try {
      await api("/admin/staff/" + s.id, "PUT", s);
      await state.reload();
    } catch (e) {
      state.setError((e as Error).message);
    }
  }
  return (
    <>
      <PageTitle
        title="Tài khoản quản lý"
        subtitle="Sinh viên không cần tài khoản."
      >
        <button className="button" onClick={() => setShow(!show)}>
          <Plus size={18} />
          Thêm tài khoản
        </button>
      </PageTitle>
      <ErrorNote error={state.error} />
      {show && (
        <form
          className="editor-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api("/admin/staff", "POST", form);
              setShow(false);
              setForm({
                username: "",
                name: "",
                password: "",
                role: "EDITOR",
                enabled: true,
              });
              await state.reload();
            } catch (e) {
              state.setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Họ tên
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            Tên đăng nhập
            <input
              required
              pattern="[a-zA-Z0-9_.-]{3,60}"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
          </label>
          <label>
            Mật khẩu ban đầu
            <input
              type="password"
              required
              minLength={12}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </label>
          <label>
            Vai trò
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              <option value="EDITOR">Biên tập viên</option>
              <option value="ADMIN">Quản trị viên</option>
            </select>
          </label>
          <button className="button" disabled={busy}>
            Tạo tài khoản
          </button>
        </form>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Họ tên</th>
              <th>Vai trò</th>
              <th>Trạng thái</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {state.data.map((s) => (
              <tr key={s.id}>
                <td>
                  <strong>{s.name}</strong>
                  <small>{s.username}</small>
                </td>
                <td>
                  <select
                    aria-label={"Quyền của " + s.name}
                    disabled={s.id === actor?.id}
                    value={s.role}
                    onChange={(e) => update({ ...s, role: e.target.value })}
                  >
                    <option value="EDITOR">Biên tập viên</option>
                    <option value="ADMIN">Quản trị viên</option>
                  </select>
                </td>
                <td>{s.enabled ? "Đang hoạt động" : "Đã khóa"}</td>
                <td>
                  <button
                    className="button outline small"
                    disabled={s.id === actor?.id}
                    onClick={() => update({ ...s, enabled: !s.enabled })}
                  >
                    {s.enabled ? "Khóa" : "Mở khóa"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
