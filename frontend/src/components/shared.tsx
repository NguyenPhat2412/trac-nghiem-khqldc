"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  Clock,
  LogOut,
  Trophy,
  X,
} from "lucide-react";
import { api, setCsrf, duration } from "@/lib/api";
import { Actor, Rank, Question } from "@/lib/types";
const Session = createContext<{
  actor: Actor | null;
  ready: boolean;
  refresh: () => Promise<void>;
}>({ actor: null, ready: false, refresh: async () => {} });
export const useSession = () => useContext(Session);
export function Shell({ children }: { children: ReactNode }) {
  const [actor, setActor] = useState<Actor | null>(null);
  const [ready, setReady] = useState(false);
  const path = usePathname();
  async function refresh() {
    try {
      const r = await api<{ actor?: Actor }>("/session");
      setActor(r.actor || null);
      setCsrf(r.actor?.csrf || "");
    } finally {
      setReady(true);
    }
  }
  useEffect(() => {
    void refresh().catch(() => {});
  }, []);
  return (
    <Session.Provider value={{ actor, ready, refresh }}>
      <header className="header">
        <div className="nav">
          <Link className="brand" href="/">
            <span>
              <b>V</b>
              <b>J</b>
              <b>U</b>
            </span>{" "}
            Quiz
            <span className="brand-dot" />
          </Link>
          <nav aria-label="Điều hướng chính">
            {[
              ["/", "Tự luyện"],
              ["/leaderboard", "Bảng xếp hạng"],
              ["/history", "Lịch sử"],
            ].map(([href, label]) => (
              <Link
                key={href}
                className={path === href ? "active" : ""}
                href={href}
              >
                {label}
              </Link>
            ))}
          </nav>
          <Link className="button outline small" href="/admin">
            {actor?.role && actor.role !== "GUEST" ? "Quản trị" : "Quản trị"}
          </Link>
        </div>
      </header>
      <main className="main">{children}</main>
      <footer>
        <span />
        Học theo nhịp của bạn.
        <span />
      </footer>
    </Session.Provider>
  );
}
export function ErrorNote({ error }: { error: string }) {
  return error ? (
    <div role="alert" className="error">
      <X size={18} />
      {error}
    </div>
  ) : null;
}
export function Loading() {
  return (
    <div className="empty">
      <div className="spinner" />
      Đang tải…
    </div>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty">
      <BookOpen size={32} />
      <p>{children}</p>
    </div>
  );
}
export function PageTitle({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
export function Timer({
  deadline,
  serverTime,
  onEnd,
}: {
  deadline: number;
  serverTime: number;
  onEnd?: () => void;
}) {
  const [now, setNow] = useState(serverTime);
  useEffect(() => {
    const offset = serverTime - Date.now();
    setNow(Date.now() + offset);
    const id = setInterval(() => setNow(Date.now() + offset), 500);
    return () => clearInterval(id);
  }, [serverTime]);
  useEffect(() => {
    if (deadline && now >= deadline) onEnd?.();
  }, [now, deadline, onEnd]);
  return (
    <span
      className={`timer ${deadline && deadline - now < 15000 ? "urgent" : ""}`}
    >
      <Clock size={18} />
      {deadline ? duration(deadline - now) : "Không giới hạn"}
    </span>
  );
}
export function Answers({
  question,
  selected,
  onSelect,
  reveal = false,
  disabled = false,
}: {
  question: Question;
  selected?: number;
  onSelect?: (i: number) => void;
  reveal?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="answers">
      {question.options.map((text, i) => (
        <button
          key={i}
          disabled={disabled || reveal}
          aria-pressed={selected === i}
          className={`answer ${selected === i ? "selected" : ""} ${reveal && i === question.correct ? "correct" : ""} ${reveal && selected === i && i !== question.correct ? "wrong" : ""}`}
          onClick={() => onSelect?.(i)}
        >
          <span className="letter">{"ABCD"[i]}</span>
          <span>{text}</span>
          {reveal && i === question.correct ? (
            <Check size={22} />
          ) : reveal && selected === i ? (
            <X size={22} />
          ) : null}
        </button>
      ))}
    </div>
  );
}
export function Ranking({
  rows,
  mine,
  podium = false,
}: {
  rows: Rank[];
  mine?: string;
  podium?: boolean;
}) {
  return (
    <>
      {podium && rows.length > 0 && (
        <div className="podium">
          {rows.slice(0, 3).map((r) => (
            <div key={r.playerId} className={`podium-place place-${r.rank}`}>
              <Trophy size={r.rank === 1 ? 38 : 28} />
              <span>Hạng {r.rank}</span>
              <strong>{r.name}</strong>
              <b>{r.score.toFixed(2)} điểm</b>
              <small>{duration(r.durationMs)}</small>
            </div>
          ))}
        </div>
      )}
      {rows.length === 0 ? (
        <Empty>Chưa có kết quả. Hãy là người đầu tiên hoàn thành bài!</Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Hạng</th>
                <th>Người chơi</th>
                <th>Điểm</th>
                <th>Thời gian</th>
                {rows.some((r) => r.attempts !== undefined) && <th>Số lượt</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.playerId}
                  className={r.playerId === mine ? "mine" : ""}
                >
                  <td>
                    <span className={`rank rank-${r.rank}`}>{r.rank}</span>
                  </td>
                  <td>
                    <strong>{r.name}</strong>
                    {r.playerId === mine && <span className="badge">Bạn</span>}
                    <small>#{r.shortId}</small>
                  </td>
                  <td>
                    <b>{r.score.toFixed(2)}</b>
                  </td>
                  <td>{duration(r.durationMs)}</td>
                  {r.attempts !== undefined && <td>{r.attempts}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
export function Review({
  question,
  selected,
}: {
  question: Question;
  selected?: number;
}) {
  return (
    <details className="review">
      <summary>
        <span
          className={selected === question.correct ? "text-green" : "text-red"}
        >
          {selected === question.correct ? (
            <Check size={20} />
          ) : (
            <X size={20} />
          )}
        </span>
        {question.text}
        <small>
          {selected === undefined || selected < 0
            ? "Bỏ trống"
            : selected === question.correct
              ? "Đúng"
              : "Sai"}
        </small>
      </summary>
      <Answers question={question} selected={selected} reveal />
      <p className="explanation">
        <strong>Giải thích: </strong>
        {question.explanation || "Chưa có lời giải."}
      </p>
    </details>
  );
}
export function Arrow() {
  return <ArrowRight size={20} />;
}
