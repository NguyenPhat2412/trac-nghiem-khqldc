"use client";
import { useState } from "react";
import {
  Plus,
  Edit3,
  Search,
  Upload,
  Download,
  Eye,
  Save,
  X,
} from "lucide-react";
import { api, statusLabel } from "@/lib/api";
import { Chapter, Question, Quiz } from "@/lib/types";
import { Answers, ErrorNote, Loading, PageTitle, Empty } from "./shared";
import { useLoad } from "@/lib/use-load";
const statuses = ["DRAFT", "PUBLISHED", "ARCHIVED"];
const difficulties: Record<string, string> = {
  EASY: "Dễ",
  MEDIUM: "Trung bình",
  HARD: "Khó",
};
function Status({
  value,
  onChange,
}: {
  value: string;
  onChange: (s: string) => void;
}) {
  return (
    <label>
      Trạng thái
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {statuses.map((s) => (
          <option key={s} value={s}>
            {statusLabel(s)}
          </option>
        ))}
      </select>
    </label>
  );
}
export function ChaptersAdmin() {
  const state = useLoad<Chapter[]>("/admin/chapters", []);
  const [edit, setEdit] = useState<Chapter | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <PageTitle
        title="Chương học"
        subtitle="Sắp xếp kiến thức thành từng bước nhỏ."
      >
        <button
          className="button"
          onClick={() =>
            setEdit({
              id: "",
              title: "",
              description: "",
              position: state.data.length + 1,
              status: "DRAFT",
            })
          }
        >
          <Plus size={18} />
          Thêm chương
        </button>
      </PageTitle>
      <ErrorNote error={state.error} />
      {edit && (
        <form
          className="editor-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api(
                "/admin/chapters" + (edit.id ? "/" + edit.id : ""),
                edit.id ? "PUT" : "POST",
                edit,
              );
              setEdit(null);
              await state.reload();
            } catch (e) {
              state.setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="section-heading">
            <h2>{edit.id ? "Sửa chương" : "Chương mới"}</h2>
            <button
              type="button"
              className="icon-button"
              aria-label="Đóng"
              onClick={() => setEdit(null)}
            >
              <X size={20} />
            </button>
          </div>
          <label>
            Tên chương
            <input
              required
              maxLength={200}
              value={edit.title}
              onChange={(e) => setEdit({ ...edit, title: e.target.value })}
            />
          </label>
          <label>
            Mô tả
            <textarea
              value={edit.description}
              onChange={(e) =>
                setEdit({ ...edit, description: e.target.value })
              }
            />
          </label>
          <div className="form-row">
            <label>
              Thứ tự
              <input
                type="number"
                min={0}
                value={edit.position}
                onChange={(e) =>
                  setEdit({ ...edit, position: Number(e.target.value) })
                }
              />
            </label>
            <Status
              value={edit.status || "DRAFT"}
              onChange={(status) => setEdit({ ...edit, status })}
            />
          </div>
          <button className="button" disabled={busy}>
            <Save size={18} />
            Lưu chương
          </button>
        </form>
      )}
      {state.loading ? (
        <Loading />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Thứ tự</th>
                <th>Tên chương</th>
                <th>Trạng thái</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {state.data.map((c) => (
                <tr key={c.id}>
                  <td>{c.position}</td>
                  <td>
                    <strong>{c.title}</strong>
                    <small>{c.description}</small>
                    <small className="mono">{c.id}</small>
                  </td>
                  <td>
                    <span className="badge">{statusLabel(c.status || "")}</span>
                  </td>
                  <td>
                    <button
                      className="button outline small"
                      onClick={() => setEdit(c)}
                    >
                      <Edit3 size={15} />
                      Sửa
                    </button>
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
const newQuestion = (chapterId = ""): Question => ({
  id: "",
  chapterId,
  text: "",
  options: ["", "", "", ""],
  correct: 0,
  explanation: "",
  imageUrl: "",
  difficulty: "MEDIUM",
  status: "DRAFT",
});
export function QuestionFields({
  q,
  change,
  chapters,
}: {
  q: Question;
  change: (q: Question) => void;
  chapters: Chapter[];
}) {
  return (
    <>
      <div className="form-row">
        <label>
          Chương
          <select
            required
            value={q.chapterId}
            onChange={(e) => change({ ...q, chapterId: e.target.value })}
          >
            <option value="">Chọn chương</option>
            {chapters.map((c) => (
              <option value={c.id} key={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Độ khó
          <select
            value={q.difficulty}
            onChange={(e) => change({ ...q, difficulty: e.target.value })}
          >
            {Object.entries(difficulties).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <Status
          value={q.status || "DRAFT"}
          onChange={(status) => change({ ...q, status })}
        />
      </div>
      <label>
        Nội dung câu hỏi
        <textarea
          required
          value={q.text}
          onChange={(e) => change({ ...q, text: e.target.value })}
        />
      </label>
      <div className="form-grid">
        {q.options.map((o, i) => (
          <label key={i}>
            Đáp án {"ABCD"[i]}
            <input
              required
              value={o}
              onChange={(e) =>
                change({
                  ...q,
                  options: q.options.map((x, j) =>
                    i === j ? e.target.value : x,
                  ),
                })
              }
            />
          </label>
        ))}
      </div>
      <label>
        Đáp án đúng
        <select
          value={q.correct}
          onChange={(e) => change({ ...q, correct: Number(e.target.value) })}
        >
          {q.options.map((_, i) => (
            <option key={i} value={i}>
              {"ABCD"[i]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Giải thích
        <textarea
          value={q.explanation}
          onChange={(e) => change({ ...q, explanation: e.target.value })}
        />
      </label>
      <label>
        Liên kết hình minh họa (HTTPS, không bắt buộc)
        <input
          type="url"
          value={q.imageUrl}
          placeholder="https://…"
          onChange={(e) => change({ ...q, imageUrl: e.target.value })}
        />
      </label>
    </>
  );
}
export function QuestionsAdmin() {
  const state = useLoad<Question[]>("/admin/questions", []);
  const chapters = useLoad<Chapter[]>("/admin/chapters", []);
  const [edit, setEdit] = useState<Question | null>(null);
  const [preview, setPreview] = useState(false);
  const [search, setSearch] = useState("");
  const [chapter, setChapter] = useState("");
  const [status, setStatus] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [busy, setBusy] = useState(false);
  const filtered = state.data.filter(
    (q) =>
      (!chapter || q.chapterId === chapter) &&
      (!status || q.status === status) &&
      (!difficulty || q.difficulty === difficulty) &&
      q.text.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <PageTitle
        title="Ngân hàng câu hỏi"
        subtitle={`${state.data.length} câu hỏi trong hệ thống`}
      >
        <button
          className="button"
          onClick={() => {
            setEdit(newQuestion(chapter || chapters.data[0]?.id));
            setPreview(false);
          }}
        >
          <Plus size={18} />
          Thêm câu hỏi
        </button>
      </PageTitle>
      <ErrorNote error={state.error || chapters.error} />
      {edit && (
        <form
          className="editor-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api(
                "/admin/questions" + (edit.id ? "/" + edit.id : ""),
                edit.id ? "PUT" : "POST",
                edit,
              );
              setEdit(null);
              await state.reload();
            } catch (e) {
              state.setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="section-heading">
            <h2>{edit.id ? "Sửa câu hỏi" : "Câu hỏi mới"}</h2>
            <button
              type="button"
              aria-label="Đóng"
              className="icon-button"
              onClick={() => setEdit(null)}
            >
              <X size={20} />
            </button>
          </div>
          {preview ? (
            <>
              <h2>{edit.text}</h2>
              {edit.imageUrl && (
                <img
                  className="question-image"
                  src={edit.imageUrl}
                  alt="Minh họa"
                />
              )}
              <Answers question={edit} reveal />
              <p>{edit.explanation}</p>
            </>
          ) : (
            <QuestionFields
              q={edit}
              change={setEdit}
              chapters={chapters.data}
            />
          )}
          <div className="actions">
            <button className="button" disabled={busy}>
              <Save size={18} />
              Lưu câu hỏi
            </button>
            <button
              type="button"
              className="button outline"
              onClick={() => setPreview(!preview)}
            >
              <Eye size={18} />
              {preview ? "Tiếp tục chỉnh sửa" : "Xem trước"}
            </button>
          </div>
        </form>
      )}
      <div className="filter-bar compact">
        <input
          aria-label="Tìm câu hỏi"
          placeholder="Tìm nội dung câu hỏi…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="Lọc chương"
          value={chapter}
          onChange={(e) => setChapter(e.target.value)}
        >
          <option value="">Tất cả chương</option>
          {chapters.data.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
        <select
          aria-label="Lọc trạng thái"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Mọi trạng thái</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>
        <select
          aria-label="Lọc độ khó"
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value)}
        >
          <option value="">Mọi độ khó</option>
          {Object.entries(difficulties).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      {state.loading ? (
        <Loading />
      ) : filtered.length === 0 ? (
        <Empty>Không có câu hỏi phù hợp.</Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Câu hỏi</th>
                <th>Độ khó</th>
                <th>Trạng thái</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((q) => (
                <tr key={q.id}>
                  <td>
                    <strong>{q.text}</strong>
                    <small>
                      {chapters.data.find((c) => c.id === q.chapterId)?.title}
                    </small>
                  </td>
                  <td>{difficulties[q.difficulty || "MEDIUM"]}</td>
                  <td>
                    <span className="badge">{statusLabel(q.status || "")}</span>
                  </td>
                  <td>
                    <button
                      className="button outline small"
                      onClick={() => {
                        setEdit(q);
                        setPreview(false);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    >
                      Sửa
                    </button>
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
type QuizForm = {
  id: string;
  title: string;
  description: string;
  status: string;
  questionIds: string[];
  chapterIds: string[];
  count: number;
  timeLimitSeconds: number;
  questionSeconds: number;
  shuffle: boolean;
};
export function QuizzesAdmin() {
  const state = useLoad<Quiz[]>("/admin/quizzes", []);
  const questions = useLoad<Question[]>("/admin/questions", []);
  const chapters = useLoad<Chapter[]>("/admin/chapters", []);
  const [edit, setEdit] = useState<QuizForm | null>(null);
  const [random, setRandom] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <PageTitle
        title="Bộ quiz"
        subtitle="Bộ câu hỏi cố định để luyện tập và thi cùng lớp."
      >
        <button
          className="button"
          onClick={() => {
            setRandom(false);
            setEdit({
              id: "",
              title: "",
              description: "",
              status: "DRAFT",
              questionIds: [],
              chapterIds: [],
              count: 4,
              timeLimitSeconds: 600,
              questionSeconds: 30,
              shuffle: true,
            });
          }}
        >
          <Plus size={18} />
          Tạo bộ quiz
        </button>
      </PageTitle>
      <ErrorNote error={state.error} />
      {edit && (
        <form
          className="editor-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api(
                "/admin/quizzes" + (edit.id ? "/" + edit.id : ""),
                edit.id ? "PUT" : "POST",
                { ...edit, questionIds: random ? [] : edit.questionIds },
              );
              setEdit(null);
              await state.reload();
            } catch (e) {
              state.setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="section-heading">
            <h2>{edit.id ? "Chỉnh sửa bộ quiz" : "Bộ quiz mới"}</h2>
            <button
              type="button"
              aria-label="Đóng"
              className="icon-button"
              onClick={() => setEdit(null)}
            >
              <X size={20} />
            </button>
          </div>
          <p className="notice">
            Thay đổi bộ quiz đã xuất bản tạo phiên bản mới và bảng xếp hạng
            riêng.
          </p>
          <label>
            Tên bộ quiz
            <input
              required
              value={edit.title}
              onChange={(e) => setEdit({ ...edit, title: e.target.value })}
            />
          </label>
          <label>
            Mô tả
            <textarea
              value={edit.description}
              onChange={(e) =>
                setEdit({ ...edit, description: e.target.value })
              }
            />
          </label>
          <div className="form-row">
            <label>
              Giới hạn bài tự luyện (giây; 0 = không giới hạn)
              <input
                type="number"
                min={0}
                max={7200}
                value={edit.timeLimitSeconds}
                onChange={(e) =>
                  setEdit({ ...edit, timeLimitSeconds: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Thời gian mỗi câu trong phòng (giây)
              <input
                type="number"
                min={5}
                max={300}
                value={edit.questionSeconds}
                onChange={(e) =>
                  setEdit({ ...edit, questionSeconds: Number(e.target.value) })
                }
              />
            </label>
          </div>
          <Status
            value={edit.status}
            onChange={(status) => setEdit({ ...edit, status })}
          />
          <label className="checkbox">
            <input
              type="checkbox"
              checked={edit.shuffle}
              onChange={(e) => setEdit({ ...edit, shuffle: e.target.checked })}
            />
            Đảo câu và đáp án khi tự luyện
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={random}
              onChange={(e) => setRandom(e.target.checked)}
            />
            Chọn câu ngẫu nhiên theo chương
          </label>
          {random ? (
            <>
              <label>
                Số câu
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={edit.count}
                  onChange={(e) =>
                    setEdit({ ...edit, count: Number(e.target.value) })
                  }
                />
              </label>
              {chapters.data.map((c) => (
                <label className="checkbox" key={c.id}>
                  <input
                    type="checkbox"
                    checked={edit.chapterIds.includes(c.id)}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        chapterIds: e.target.checked
                          ? [...edit.chapterIds, c.id]
                          : edit.chapterIds.filter((id) => id !== c.id),
                      })
                    }
                  />
                  {c.title}
                </label>
              ))}
            </>
          ) : (
            <div className="check-list">
              {questions.data
                .filter((q) => q.status === "PUBLISHED")
                .map((q) => (
                  <label className="checkbox" key={q.id}>
                    <input
                      type="checkbox"
                      checked={edit.questionIds.includes(q.id)}
                      onChange={(e) =>
                        setEdit({
                          ...edit,
                          questionIds: e.target.checked
                            ? [...edit.questionIds, q.id]
                            : edit.questionIds.filter((id) => id !== q.id),
                        })
                      }
                    />
                    {q.text}
                  </label>
                ))}
            </div>
          )}
          <button className="button" disabled={busy}>
            Lưu bộ quiz
          </button>
        </form>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Bộ quiz</th>
              <th>Số câu</th>
              <th>Trạng thái</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {state.data.map((q) => (
              <tr key={q.id}>
                <td>
                  <strong>{q.title}</strong>
                  <small>Phiên bản {q.version}</small>
                </td>
                <td>{q.questions?.length}</td>
                <td>
                  <span className="badge">{statusLabel(q.status)}</span>
                </td>
                <td>
                  <button
                    className="button outline small"
                    onClick={() => {
                      setRandom(false);
                      setEdit({
                        id: q.id,
                        title: q.title,
                        description: q.description,
                        status: q.status,
                        questionIds: q.questions?.map((x) => x.id) || [],
                        chapterIds: [],
                        count: 4,
                        timeLimitSeconds: q.timeLimitSeconds,
                        questionSeconds: q.questionSeconds,
                        shuffle: q.shuffle ?? true,
                      });
                    }}
                  >
                    Sửa
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
type ImportRow = { row: number; question: Question; error: string };
export function ImportAdmin() {
  const chapters = useLoad<Chapter[]>("/admin/chapters", []);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [edit, setEdit] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <PageTitle
        title="Nhập câu hỏi từ Excel"
        subtitle="Tải mẫu, điền nội dung, kiểm tra rồi nhập vào ngân hàng."
      />
      <ErrorNote error={error} />
      {success && <p className="success">{success}</p>}
      <div className="import-box">
        <Upload size={34} />
        <h2>Thêm nhiều câu hỏi cùng lúc</h2>
        <p>
          Tệp .xlsx tối đa 5 MB và 1.000 câu. Cột chapterId lấy từ danh sách
          chương.
        </p>
        <div className="actions">
          <a className="button outline" href="/api/admin/import/template">
            <Download size={18} />
            Tải mẫu Excel
          </a>
          <label className="button">
            Chọn tệp Excel
            <input
              hidden
              type="file"
              accept=".xlsx"
              disabled={busy}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setBusy(true);
                setError("");
                setSuccess("");
                try {
                  const form = new FormData();
                  form.append("file", file);
                  setRows(
                    await api<ImportRow[]>(
                      "/admin/import/preview",
                      "POST",
                      form,
                    ),
                  );
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                  e.target.value = "";
                }
              }}
            />
          </label>
        </div>
      </div>
      {rows.length > 0 && (
        <>
          <div className="section-heading">
            <h2>{rows.length} câu cần kiểm tra</h2>
            <button
              className="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await api<{ imported: number }>(
                    "/admin/import/commit",
                    "POST",
                    rows.map((x) => x.question),
                  );
                  setSuccess(`Đã nhập ${r.imported} câu hỏi.`);
                  setRows([]);
                  setEdit(null);
                  setError("");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Xác nhận nhập tất cả
            </button>
          </div>
          <p className="notice">
            Hệ thống kiểm tra lại toàn bộ khi xác nhận. Nếu có lỗi, chưa câu nào
            được nhập.
          </p>
          {edit !== null && (
            <div className="editor-form">
              <QuestionFields
                q={rows[edit].question}
                chapters={chapters.data}
                change={(q) =>
                  setRows(
                    rows.map((r, i) =>
                      i === edit
                        ? {
                            ...r,
                            question: q,
                            error: "Đã sửa; sẽ kiểm tra lại khi nhập",
                          }
                        : r,
                    ),
                  )
                }
              />
              <button className="button" onClick={() => setEdit(null)}>
                Xong chỉnh sửa
              </button>
            </div>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Dòng</th>
                  <th>Câu hỏi</th>
                  <th>Kiểm tra</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.row}>
                    <td>{r.row}</td>
                    <td>{r.question.text}</td>
                    <td className={r.error ? "text-red" : "text-green"}>
                      {r.error || "Hợp lệ"}
                    </td>
                    <td>
                      <button
                        className="button outline small"
                        onClick={() => setEdit(i)}
                      >
                        Sửa
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
