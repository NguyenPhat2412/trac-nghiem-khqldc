"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Search,
  Users,
  Clock,
  BookOpen,
  Check,
} from "lucide-react";
import { api, duration } from "@/lib/api";
import { Actor, Attempt, Catalog, Room } from "@/lib/types";
import { ErrorNote, Loading, useSession } from "./shared";
export function Home() {
  const { actor, refresh } = useSession();
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [data, setData] = useState<Catalog | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [count, setCount] = useState(4);
  const [minutes, setMinutes] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<Catalog>("/catalog")
      .then(setData)
      .catch((e) => setError(e.message));
    setCode(new URLSearchParams(window.location.search).get("room") || "");
  }, []);
  useEffect(() => {
    if (actor) setName(actor.name);
  }, [actor]);
  async function identify() {
    if (!name.trim())
      throw new Error("Nhập tên của bạn trước khi bắt đầu nhé.");
    if (!actor || actor.name !== name.trim()) {
      await api<Actor>("/session", "POST", { name: name.trim() });
      await refresh();
    }
  }
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await identify();
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function start(body: unknown) {
    await act(async () => {
      const a = await api<Attempt>("/attempts", "POST", body);
      router.push("/attempt/" + a.id);
    });
  }
  const available =
    data?.chapters
      .filter((c) => selected.includes(c.id))
      .reduce((n, c) => n + (c.count || 0), 0) || 0;
  return (
    <>
      <section className="welcome">
        <div className="welcome-copy">
          <h1>
            Học từng chương.
            <br />
            Vững từng kiến thức.
          </h1>
          <h2>Khoa học quản lý đại cương</h2>
          <p>
            Ôn tập có phương pháp, nắm vững kiến thức nền tảng
            <br className="desktop-only" /> và tự tin hơn trong học tập.
          </p>
          <label htmlFor="player-name">Tên của bạn</label>
          <input
            id="player-name"
            maxLength={40}
            placeholder="Nhập tên để bắt đầu"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            className="button wide"
            disabled={busy}
            onClick={() =>
              act(async () => {
                document
                  .getElementById("library")
                  ?.scrollIntoView({ behavior: "smooth" });
              })
            }
          >
            Bắt đầu tự luyện <ArrowRight size={20} />
          </button>
        </div>
        <form
          className="join-panel"
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              if (!/^\d{6}$/.test(code))
                throw new Error("Mã phòng gồm sáu chữ số.");
              const r = await api<Room>(`/rooms/${code}/join`, "POST", {});
              router.push("/room/" + r.id);
            });
          }}
        >
          <Users className="join-icon" size={28} />
          <h2>Cùng lớp, cùng thử thách.</h2>
          <p>Nhập mã phòng để tham gia cùng mọi người.</p>
          <label htmlFor="room-code">Mã phòng</label>
          <input
            id="room-code"
            className="code-input"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
          <button className="button white wide" disabled={busy}>
            Vào phòng <ArrowRight size={20} />
          </button>
        </form>
      </section>
      <ErrorNote error={error} />
      <section id="library" className="library">
        <div className="section-heading">
          <h2>Khám phá các chương</h2>
          <div className="search">
            <Search size={19} />
            <input
              aria-label="Tìm kiếm chương học"
              placeholder="Tìm kiếm chương học…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        {!data ? (
          <Loading />
        ) : (
          <>
            <div className="chapter-list">
              {data.chapters
                .filter((c) =>
                  c.title.toLowerCase().includes(search.toLowerCase()),
                )
                .map((c, i) => (
                  <button
                    className={`chapter ${selected.includes(c.id) ? "chosen" : ""}`}
                    key={c.id}
                    onClick={() => {
                      setSelected((v) =>
                        v.includes(c.id)
                          ? v.filter((x) => x !== c.id)
                          : [...v, c.id],
                      );
                    }}
                  >
                    <span className="chapter-number">
                      {selected.includes(c.id) ? (
                        <Check size={26} />
                      ) : (
                        String(i + 1).padStart(2, "0")
                      )}
                    </span>
                    <span className="chapter-text">
                      <strong>{c.title}</strong>
                      <small>
                        {c.description.includes("minh họa")
                          ? "Dữ liệu minh họa"
                          : "Ôn tập theo chương"}
                        <span>•</span>
                        {c.count} câu hỏi
                      </small>
                    </span>
                    <ArrowRight size={23} />
                  </button>
                ))}
            </div>
            {selected.length > 0 && (
              <div className="practice-config">
                <div>
                  <h3>Tạo bài luyện của bạn</h3>
                  <p>
                    {selected.length} chương đã chọn · {available} câu có sẵn ·
                    Không xếp hạng
                  </p>
                </div>
                <label>
                  Số câu
                  <input
                    type="number"
                    min={1}
                    max={available}
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                  />
                </label>
                <label>
                  Thời gian
                  <select
                    value={minutes}
                    onChange={(e) => setMinutes(Number(e.target.value))}
                  >
                    <option value={0}>Không giới hạn</option>
                    <option value={5}>5 phút</option>
                    <option value={10}>10 phút</option>
                    <option value={20}>20 phút</option>
                  </select>
                </label>
                <button
                  className="button"
                  disabled={busy}
                  onClick={() =>
                    start({
                      chapterIds: selected,
                      count: Math.min(count, available),
                      timeLimitSeconds: minutes * 60,
                    })
                  }
                >
                  Luyện ngay <ArrowRight size={18} />
                </button>
              </div>
            )}
            <div className="section-heading quiz-section">
              <div>
                <h2>Bộ quiz có xếp hạng</h2>
                <p>Cùng một bộ câu hỏi. Cùng chinh phục thứ hạng.</p>
              </div>
              <BookOpen size={26} />
            </div>
            <div className="quiz-grid">
              {data.quizzes.map((q) => (
                <article className="quiz-card" key={q.id}>
                  <span className="quiz-version">PHIÊN BẢN {q.version}</span>
                  <h3>{q.title}</h3>
                  <p>{q.description}</p>
                  <div className="quiz-meta">
                    <span>
                      <BookOpen size={16} />
                      {q.count} câu
                    </span>
                    <span>
                      <Clock size={16} />
                      {q.timeLimitSeconds
                        ? duration(q.timeLimitSeconds * 1000)
                        : "Không giới hạn"}
                    </span>
                  </div>
                  <button
                    className="button outline wide"
                    disabled={busy}
                    onClick={() => start({ quizId: q.id })}
                  >
                    Làm bài <ArrowRight size={18} />
                  </button>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </>
  );
}
