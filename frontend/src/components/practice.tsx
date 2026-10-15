"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Flag,
  CheckCircle,
  RotateCcw,
  Trophy,
} from "lucide-react";
import { api, duration } from "@/lib/api";
import { Attempt, History, Catalog, Rank } from "@/lib/types";
import { FairPlay } from "./fair-play";
import {
  Celebration,
  Feedback,
  GameDialog,
  GameToolbar,
  useGame,
} from "./game-experience";
import {
  Answers,
  Empty,
  ErrorNote,
  Loading,
  PageTitle,
  Ranking,
  Review,
  Timer,
  useSession,
} from "./shared";
export function Practice({ id }: { id: string }) {
  const { online } = useGame();
  const [data, setData] = useState<Attempt | null>(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const submitting = useRef(false);
  const saving = useRef(false);
  const mutation = useRef(0);
  const activeId = useRef(id);
  activeId.current = id;
  const router = useRouter();
  const apply = (value: Attempt) => {
    if (activeId.current !== value.id) return;
    setData((previous) =>
      previous?.id === value.id && previous.status === "DONE"
        ? previous
        : value,
    );
  };
  useEffect(() => {
    setData(null);
    setIndex(0);
    setError("");
    const sync = () => {
      if (
        document.visibilityState === "hidden" ||
        saving.current ||
        submitting.current
      )
        return;
      const revision = mutation.current;
      api<Attempt>("/attempts/" + id)
        .then((a) => {
          if (revision === mutation.current) {
            apply(a);
            setError("");
          }
        })
        .catch((e) => setError(e.message));
    };
    sync();
    window.addEventListener("online", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener("online", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [id]);
  async function submit() {
    if (submitting.current) return;
    submitting.current = true;
    mutation.current++;
    setBusy(true);
    try {
      apply(await api<Attempt>(`/attempts/${id}/submit`, "POST", {}));
      setError("");
      setConfirm(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      submitting.current = false;
    }
  }
  async function save(body: unknown) {
    if (saving.current || submitting.current) return;
    saving.current = true;
    mutation.current++;
    setBusy(true);
    setError("");
    try {
      apply(await api<Attempt>(`/attempts/${id}/answer`, "PUT", body));
    } catch (e) {
      setError((e as Error).message);
      const revision = mutation.current;
      api<Attempt>("/attempts/" + id)
        .then((a) => {
          if (revision === mutation.current) apply(a);
        })
        .catch(() => {});
    } finally {
      setBusy(false);
      saving.current = false;
    }
  }
  if (!data)
    return (
      <>
        <ErrorNote error={error} />
        {!error && <Loading />}
      </>
    );
  if (data.status === "DONE")
    return (
      <>
        <GameToolbar />
        <PageTitle title="Bạn đã hoàn thành!" subtitle={data.title}>
          <Link className="button outline" href="/">
            Về trang chủ
          </Link>
        </PageTitle>
        <ErrorNote error={error} />
        <section className="result-banner">
          <Celebration />
          <CheckCircle size={48} />
          <div>
            <span>Kết quả của bạn</span>
            <h2>
              {data.score.toFixed(2)}
              <small>/ 100</small>
            </h2>
          </div>
          <div>
            <b>
              {data.correct}/{data.questions.length}
            </b>
            <span>Câu trả lời đúng</span>
          </div>
          <div>
            <b>{duration(data.durationMs)}</b>
            <span>Thời gian làm bài</span>
          </div>
          <div>
            <b>{Object.keys(data.answers).length - data.correct}</b>
            <span>Câu trả lời sai</span>
          </div>
          <div>
            <b>{data.questions.length - Object.keys(data.answers).length}</b>
            <span>Câu bỏ trống</span>
          </div>
        </section>
        <div className="actions">
          <button
            className="button"
            disabled={busy || data.correct === data.questions.length}
            onClick={async () => {
              setBusy(true);
              try {
                const a = await api<Attempt>("/attempts", "POST", {
                  retryId: id,
                });
                router.push("/attempt/" + a.id);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <RotateCcw size={18} />
            Luyện lại câu sai
          </button>
          {data.ranked && (
            <Link
              className="button outline"
              href={"/leaderboard?quiz=" + data.quizId}
            >
              <Trophy size={18} />
              Xem thứ hạng
            </Link>
          )}
        </div>
        <h2 className="section-label">Cùng xem lại kiến thức</h2>
        {data.questions.map((q) => (
          <Review key={q.id} question={q} selected={data.answers[q.id]} />
        ))}
      </>
    );
  const q = data.questions[index];
  const answered = data.answers[q.id] !== undefined;
  const questionContent = (
    <>
      <h2>{q.text}</h2>
      {q.imageUrl && (
        <img
          className="question-image"
          src={q.imageUrl}
          alt="Hình minh họa câu hỏi"
        />
      )}
      <Answers
        question={q}
        selected={data.answers[q.id]}
        disabled={
          busy || !online || confirm || (data.instantFeedback && answered)
        }
        shortcuts
        reveal={data.instantFeedback && answered}
        onSelect={(answer) => save({ questionId: q.id, answer })}
      />
      {data.instantFeedback && answered && (
        <Feedback
          eventKey={`${id}:${q.id}`}
          outcome={data.answers[q.id] === q.correct ? "correct" : "wrong"}
        >
          <p>
            Đáp án đúng:{" "}
            <b>
              {q.correct === undefined
                ? ""
                : `${"ABCD"[q.correct]}. ${q.options[q.correct]}`}
            </b>
          </p>
          <p>{q.explanation || "Chưa có lời giải."}</p>
          <small>
            Đã khóa lựa chọn đầu tiên. Lượt học này không đưa vào bảng xếp hạng.
          </small>
        </Feedback>
      )}
    </>
  );
  return (
    <>
      <GameToolbar />
      <div className="quiz-top">
        <Link href="/history" className="text-link">
          <ArrowLeft size={18} />
          Lưu và quay lại sau
        </Link>
        <Timer
          deadline={data.deadline}
          serverTime={data.serverTime}
          totalMs={data.deadline - data.startedAt}
          onEnd={() => void submit()}
        />
      </div>
      <PageTitle
        title={data.title}
        subtitle={`Câu ${index + 1} / ${data.questions.length} · Đã trả lời ${Object.keys(data.answers).length} câu`}
      />
      <div
        className="progress"
        role="progressbar"
        aria-label="Tiến độ làm bài"
        aria-valuemin={0}
        aria-valuemax={data.questions.length}
        aria-valuenow={Object.keys(data.answers).length}
      >
        <span
          style={{
            transform: `scaleX(${Object.keys(data.answers).length / data.questions.length})`,
          }}
        />
      </div>
      <ErrorNote error={error} />
      {error && (
        <button
          className="button outline small"
          disabled={busy || !online}
          onClick={() => {
            const revision = mutation.current;
            void api<Attempt>("/attempts/" + id)
              .then((a) => {
                if (revision === mutation.current) {
                  apply(a);
                  setError("");
                }
              })
              .catch((e) => setError(e.message));
          }}
        >
          Đồng bộ lại bài làm
        </button>
      )}
      <div className="quiz-layout">
        <section className="question-panel">
          <div className="question-heading">
            <span>CÂU {String(index + 1).padStart(2, "0")}</span>
            <button
              className={`button ghost small ${data.flagged.includes(q.id) ? "flagged" : ""}`}
              disabled={busy || !online}
              onClick={() =>
                save({
                  questionId: q.id,
                  flagged: !data.flagged.includes(q.id),
                })
              }
            >
              <Flag size={17} />
              {data.flagged.includes(q.id) ? "Đã đánh dấu" : "Xem lại sau"}
            </button>
          </div>
          <div className="question-transition" key={q.id}>
            {data.ranked ? (
              <FairPlay endpoint={`/attempts/${id}/integrity`}>
                {questionContent}
              </FairPlay>
            ) : (
              questionContent
            )}
          </div>
          <div className="question-nav">
            <button
              className="button outline"
              disabled={index === 0 || busy}
              onClick={() => setIndex((i) => i - 1)}
            >
              <ArrowLeft size={18} />
              Câu trước
            </button>
            <span className="muted">
              {busy
                ? "Đang lưu…"
                : error
                  ? "Chưa xác nhận lưu — hãy thử lại"
                  : "Đã lưu trên hệ thống"}
            </span>
            <button
              className="button"
              disabled={index === data.questions.length - 1 || busy}
              onClick={() => setIndex((i) => i + 1)}
            >
              Câu tiếp <ArrowRight size={18} />
            </button>
          </div>
        </section>
        <aside className="question-sidebar">
          <h3>Tiến độ của bạn</h3>
          <div className="progress-summary">
            <strong>
              {Object.keys(data.answers).length}
              <small> / {data.questions.length}</small>
            </strong>
            <span>đã trả lời · {data.flagged.length} đánh dấu</span>
          </div>
          <div className="question-numbers">
            {data.questions.map((x, i) => (
              <button
                key={x.id}
                aria-label={`Đến câu ${i + 1}`}
                aria-current={i === index ? "step" : undefined}
                disabled={busy}
                className={`${i === index ? "current" : ""} ${data.answers[x.id] !== undefined ? "answered" : ""} ${data.flagged.includes(x.id) ? "flagged" : ""}`}
                onClick={() => setIndex(i)}
              >
                {i + 1}
                {data.flagged.includes(x.id) && <Flag size={10} />}
              </button>
            ))}
          </div>
          <p className="muted">
            {data.instantFeedback
              ? "Hiện đáp án ngay · Không xếp hạng. Mỗi câu chỉ ghi nhận lựa chọn đầu tiên; bạn vẫn có thể quay lại đọc lời giải."
              : "Bạn có thể quay lại và đổi đáp án trước khi nộp bài."}
          </p>
          <button
            className="button wide"
            disabled={busy || !online}
            onClick={() => setConfirm(true)}
          >
            Nộp bài <CheckCircle size={18} />
          </button>
        </aside>
      </div>
      {confirm && (
        <GameDialog
          titleId="submit-title"
          busy={busy}
          onClose={() => setConfirm(false)}
        >
          <h2 id="submit-title">Sẵn sàng nộp bài?</h2>
          <p>
            Bạn đã trả lời {Object.keys(data.answers).length}/
            {data.questions.length} câu. Sau khi nộp, bạn sẽ xem được đáp án và
            lời giải.
          </p>
          <div className="actions">
            <button
              className="button outline"
              onClick={() => setConfirm(false)}
            >
              Tiếp tục làm
            </button>
            <button
              className="button"
              disabled={busy}
              onClick={() => void submit()}
            >
              Xác nhận nộp bài
            </button>
          </div>
        </GameDialog>
      )}
    </>
  );
}
export function HistoryPage() {
  const { actor, ready } = useSession();
  const [data, setData] = useState<History[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (actor)
      api<History[]>("/history")
        .then(setData)
        .catch((e) => setError(e.message));
  }, [actor]);
  return (
    <>
      <PageTitle
        title="Hành trình học tập"
        subtitle="Các bài đã làm trên trình duyệt này."
      />
      <ErrorNote error={error} />
      {!ready ? (
        <Loading />
      ) : !actor ? (
        <Empty>Nhập tên ở trang chủ để bắt đầu hành trình của bạn.</Empty>
      ) : data.length === 0 ? (
        <Empty>Bạn chưa làm bài nào. Chọn một chương để bắt đầu nhé.</Empty>
      ) : (
        <div className="history-list">
          {data.map((a) => (
            <Link key={a.id} href={"/attempt/" + a.id} className="history-row">
              <div>
                <strong>{a.title}</strong>
                <small>{new Date(a.startedAt).toLocaleString("vi-VN")}</small>
              </div>
              <span>
                {a.status === "ACTIVE"
                  ? "Tiếp tục làm bài"
                  : `${a.score.toFixed(2)} điểm`}
              </span>
              <span className="muted">
                {a.status === "DONE" ? duration(a.durationMs) : ""}
              </span>
              <ArrowRight size={20} />
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
export function Leaderboard() {
  const { actor } = useSession();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [selected, setSelected] = useState("");
  const [rows, setRows] = useState<Rank[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    api<Catalog>("/catalog")
      .then((d) => {
        setCatalog(d);
        setSelected(
          new URLSearchParams(window.location.search).get("quiz") ||
            d.quizzes[0]?.id ||
            "",
        );
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (selected)
      api<Rank[]>("/leaderboard/" + selected)
        .then(setRows)
        .catch((e) => setError(e.message));
  }, [selected]);
  return (
    <>
      <PageTitle
        title="Bảng xếp hạng"
        subtitle="Điểm cao hơn đứng trước. Cùng điểm, thời gian ngắn hơn dẫn đầu."
      />
      <ErrorNote error={error} />
      <div className="filter-bar">
        <label>
          Bộ quiz
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {catalog?.quizzes.map((q) => (
              <option value={q.id} key={q.id}>
                {q.title} · v{q.version}
              </option>
            ))}
            {selected && !catalog?.quizzes.some((q) => q.id === selected) && (
              <option value={selected}>Phiên bản quiz đã lưu trữ</option>
            )}
          </select>
        </label>
        <p>
          Mỗi người hiển thị lượt tốt nhất.
          <br />
          Tên tự khai · Nhận diện theo trình duyệt.
        </p>
      </div>
      <Ranking rows={rows} mine={actor?.id} podium />
    </>
  );
}
