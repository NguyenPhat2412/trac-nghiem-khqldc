"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Client } from "@stomp/stompjs";
import { QRCodeSVG } from "qrcode.react";
import {
  Users,
  Lock,
  Unlock,
  Play,
  ArrowLeft,
  ArrowRight,
  Flag,
  Check,
  CheckCircle,
  Copy,
  Wifi,
  WifiOff,
  Trophy,
} from "lucide-react";
import { api, duration } from "@/lib/api";
import { Room } from "@/lib/types";
import { FairPlay } from "./fair-play";
import { Toast } from "./toast";
import {
  Celebration,
  Feedback,
  GameDialog,
  GameToolbar,
  useGame,
} from "./game-experience";
import {
  Answers,
  ErrorNote,
  Loading,
  PageTitle,
  Ranking,
  Review,
  Timer,
  useSession,
} from "./shared";
export function RoomPage({ code }: { code: string }) {
  const router = useRouter();
  const { online, play } = useGame();
  const { actor, ready } = useSession();
  const [data, setData] = useState<Room | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connectionBlocked, setConnectionBlocked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [endConfirm, setEndConfirm] = useState(false);
  const [submitConfirm, setSubmitConfirm] = useState(false);
  const [examIndex, setExamIndex] = useState(0);
  const [origin, setOrigin] = useState("");
  const [expiredQuestion, setExpiredQuestion] = useState("");
  const [reviewPlayer, setReviewPlayer] = useState("");
  const finished = data?.id === code && data.status === "FINISHED";
  const sending = useRef(false);
  const examMutation = useRef(0);
  const ref = useRef<Room | null>(null);
  const fetching = useRef(false);
  const refreshPending = useRef(false);
  const connectionDenied = useRef(false);
  const apply = (r: Room, preserveLocalExam = false) => {
    if (!ref.current || r.version >= ref.current.version) {
      const merged =
        preserveLocalExam &&
        ref.current &&
        r.status === "OPEN" &&
        ref.current.examAnswers
          ? {
              ...r,
              examAnswers: ref.current.examAnswers,
              examFlagged: ref.current.examFlagged,
            }
          : r;
      ref.current = merged;
      setData(merged);
    }
  };
  async function refresh() {
    if (connectionDenied.current) return;
    if (ref.current?.id === code && ref.current.status === "FINISHED") return;
    if (fetching.current) {
      refreshPending.current = true;
      return;
    }
    fetching.current = true;
    const revisionAtStart = examMutation.current;
    try {
      const next = await api<Room>("/rooms/" + code);
      if (connectionDenied.current) return;
      apply(next, revisionAtStart !== examMutation.current || sending.current);
      setError("");
    } catch (e) {
      if (!connectionDenied.current) setError((e as Error).message);
    } finally {
      fetching.current = false;
      if (refreshPending.current) {
        refreshPending.current = false;
        void refresh();
      }
    }
  }
  useEffect(() => {
    setOrigin(window.location.origin);
    setExamIndex(0);
    if (!actor || finished) return;
    connectionDenied.current = false;
    setConnectionBlocked(false);
    void refresh();
    const url =
      process.env.NEXT_PUBLIC_WS_URL ||
      `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleRefresh = () => {
      if (refreshTimer || connectionDenied.current) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        void refresh();
      }, 120);
    };
    const client = new Client({
      brokerURL: url,
      connectHeaders: { "X-CSRF-Token": actor.csrf },
      reconnectDelay: 2000,
      connectionTimeout: 10000,
      discardWebsocketOnCommFailure: true,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      onConnect: () => {
        setConnected(true);
        client.subscribe("/topic/rooms/" + code, scheduleRefresh);
        void refresh();
      },
      onWebSocketClose: (event) => {
        setConnected(false);
        if (event.code === 1008) {
          connectionDenied.current = true;
          setConnectionBlocked(true);
          refreshPending.current = false;
          clearInterval(poll);
          clearTimeout(refreshTimer);
          client.reconnectDelay = 0;
          void client.deactivate({ force: true });
          setError(
            "Phiên kết nối không còn hợp lệ. Hãy tải lại trang để tiếp tục.",
          );
        }
      },
      onStompError: () => setConnected(false),
    });
    client.activate();
    const poll = setInterval(() => void refresh(), 4000);
    const returned = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("online", returned);
    document.addEventListener("visibilitychange", returned);
    return () => {
      clearInterval(poll);
      clearTimeout(refreshTimer);
      window.removeEventListener("online", returned);
      document.removeEventListener("visibilitychange", returned);
      void client.deactivate();
    };
  }, [actor, code, finished]);
  const stage = useRef<HTMLElement | null>(null);
  const live =
    data?.status === "QUESTION" ||
    data?.status === "REVEAL" ||
    (data?.status === "OPEN" && !data.host);
  useEffect(() => {
    // Bring each newly opened question to the middle of the screen.
    const panel = stage.current;
    if (!panel || data?.status !== "QUESTION") return;
    const fits = panel.offsetHeight < window.innerHeight - 120;
    panel.scrollIntoView({
      block: fits ? "center" : "start",
      behavior: "smooth",
    });
  }, [data?.question?.id, data?.status]);
  async function action(actionName: string, body: unknown = {}) {
    if (sending.current || connectionDenied.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      apply(
        await api<Room>(`/admin/rooms/${code}/${actionName}`, "POST", body),
      );
      setEndConfirm(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      sending.current = false;
    }
  }
  async function saveExamAnswer(body: {
    questionId: string;
    answer?: number;
    flagged?: boolean;
  }) {
    if (
      sending.current ||
      connectionDenied.current ||
      !data ||
      data.host ||
      data.status !== "OPEN" ||
      data.mySubmitted
    )
      return;
    sending.current = true;
    examMutation.current++;
    setBusy(true);
    setError("");
    try {
      const next = await api<Room>(`/rooms/${code}/exam-answer`, "PUT", body);
      apply(next);
      if (body.answer !== undefined) play("saved");
    } catch (e) {
      setError((e as Error).message);
      void refresh();
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  async function submitExamNow() {
    if (
      sending.current ||
      connectionDenied.current ||
      !data ||
      data.host ||
      data.status !== "OPEN"
    )
      return;
    sending.current = true;
    examMutation.current++;
    setBusy(true);
    setError("");
    try {
      apply(await api<Room>(`/rooms/${code}/submit`, "POST", {}));
      setSubmitConfirm(false);
      play("saved");
    } catch (e) {
      setError((e as Error).message);
      void refresh();
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  async function answer(choice: number) {
    if (
      sending.current ||
      connectionDenied.current ||
      !data?.question ||
      data.host ||
      data.myAnswer >= 0 ||
      data.status !== "QUESTION"
    )
      return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api<Room>(`/rooms/${code}/answer`, "POST", {
        questionId: data.question.id,
        answer: choice,
      });
      apply(result);
      if (result.status === "QUESTION") play("saved");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  async function readyForNext() {
    if (
      sending.current ||
      connectionDenied.current ||
      !data?.question ||
      data.host ||
      data.status !== "REVEAL" ||
      data.myReady
    )
      return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      apply(
        await api<Room>(`/rooms/${code}/ready`, "POST", {
          questionId: data.question.id,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  function handleExamTimerEnd() {
    void refresh();
    setTimeout(() => {
      if (ref.current?.status === "OPEN") void refresh();
    }, 650);
  }
  if (ready && !actor)
    return (
      <>
        <PageTitle
          title="Tham gia phòng chơi"
          subtitle="Nhập tên trước khi vào phòng."
        />
        <Link className="button" href={"/?room=" + code}>
          Nhập tên và tham gia
        </Link>
      </>
    );
  if (!data)
    return (
      <>
        <ErrorNote error={error} />
        {error ? (
          <Link className="button" href={"/?room=" + code}>
            Quay lại tham gia phòng
          </Link>
        ) : (
          <Loading />
        )}
      </>
    );
  const isExam = data.mode === "EXAM";
  const examQuestions = data.examQuestions || [];
  const examAnswers = data.examAnswers || {};
  const examFlagged = data.examFlagged || [];
  const answeredCount = Object.keys(examAnswers).length;
  const safeExamIndex = Math.min(
    examIndex,
    Math.max(0, examQuestions.length - 1),
  );
  const currentExamQ = examQuestions[safeExamIndex];
  const myRank = !data.host
    ? data.ranking.find((x) => x.playerId === actor?.id)
    : undefined;
  return (
    <div className={live ? "room-stage" : undefined}>
      <GameToolbar />
      <PageTitle
        title={
          data.status === "FINISHED" ? "Một hành trình thật tuyệt!" : data.title
        }
        subtitle={
          data.status === "FINISHED"
            ? data.early
              ? isExam
                ? "Phòng đã chốt kết quả sớm · Đã mở điểm và lời giải chi tiết"
                : "Phòng đã kết thúc sớm · Điểm tính trên các câu đã mở"
              : "Tổng kết kết quả & lời giải chi tiết"
            : `Phòng ${code} · ${data.count} câu · ${data.members.length} người tham gia`
        }
      >
        <span className="connection">
          {finished ? (
            <Check size={16} />
          ) : connected ? (
            <Wifi size={16} />
          ) : (
            <WifiOff size={16} />
          )}{" "}
          {finished
            ? "Đã hoàn tất"
            : connectionBlocked
              ? "Cần tải lại trang"
              : connected
                ? "Trực tiếp"
                : "Đang kết nối lại"}
        </span>
      </PageTitle>
      <ErrorNote error={error} />
      {data.status !== "FINISHED" && (
        <ul className="room-rules" aria-label="Luật phòng">
          {isExam ? (
            <>
              <li>
                {data.status === "LOBBY"
                  ? "Đợi ở phòng chờ · Chỉ tính giờ khi chủ phòng bấm mở đề"
                  : "Làm trọn bộ câu hỏi · Hết giờ hệ thống tự chấm và trả lời giải"}
              </li>
              <li>Ẩn đáp án và thứ hạng cho đến khi kết thúc phòng</li>
            </>
          ) : (
            <>
              <li>
                {data.untimed
                  ? "Không giới hạn thời gian trả lời"
                  : "Trả lời theo thời gian của bộ quiz"}
              </li>
              <li>
                {data.advanceWhenReady
                  ? "Chuyển câu khi tất cả bấm “Đã đọc xong”"
                  : "Chủ trì điều khiển chuyển câu"}
              </li>
            </>
          )}
          {data.shuffleAnswers && (
            <li>Vị trí A/B/C/D đảo riêng mỗi người · trả lời theo nội dung</li>
          )}
        </ul>
      )}
      {connectionBlocked && (
        <button
          className="button outline"
          onClick={() => window.location.reload()}
        >
          Tải lại trang
        </button>
      )}
      {data.host && data.integrity && data.status !== "LOBBY" && (
        <details className="integrity-panel">
          <summary>Ghi nhận tập trung · Chỉ chủ trì thấy</summary>
          <p>
            Rời trang hoặc thao tác sao chép không đủ để kết luận gian lận. Dữ
            liệu do trình duyệt gửi, có thể thiếu khi mất mạng; không tự trừ
            điểm.
          </p>
          <ul>
            {data.integrity.map((x) => (
              <li key={x.playerId}>
                <b>
                  {x.name} · #{x.playerId.slice(0, 6)}
                </b>
                : {x.signals.tabHidden} lần rời trang, {x.signals.copyBlocked}{" "}
                thao tác sao chép, {x.signals.fullscreenExit || 0} lần thoát
                toàn màn hình
                {x.signals.capped ? " (đã đạt giới hạn ghi nhận)" : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
      {data.status === "LOBBY" ? (
        <>
          <div className="lobby-grid">
            <section className="lobby-code">
              <span>MÃ THAM GIA</span>
              <strong>{code}</strong>
              <p>Vào VJU Quiz, nhập tên và mã phòng này.</p>
              {origin && (
                <QRCodeSVG
                  value={origin + "/?room=" + code}
                  size={132}
                  marginSize={2}
                />
              )}
              <button
                className="button outline"
                onClick={() =>
                  navigator.clipboard
                    .writeText(origin + "/?room=" + code)
                    .then(() => {
                      setCopied(true);
                    })
                    .catch(() =>
                      setError(
                        "Không sao chép được. Hãy dùng mã phòng ở trên.",
                      ),
                    )
                }
              >
                <Copy size={17} />
                {copied ? "Đã sao chép" : "Sao chép liên kết"}
              </button>
            </section>
            <section className="lobby-players">
              <div className="section-heading">
                <h2>
                  <Users size={24} /> {data.members.length} người đã sẵn sàng
                </h2>
                <div className="button-row">
                  {isExam && (
                    <span className="badge">
                      {Math.max(
                        1,
                        Math.round((data.durationSeconds || 60) / 60),
                      )}{" "}
                      phút làm bài
                    </span>
                  )}
                  {data.locked && <span className="badge">Đã khóa</span>}
                </div>
              </div>
              {data.members.length === 0 ? (
                <p className="empty">Đang chờ những người chơi đầu tiên…</p>
              ) : (
                <div className="player-grid">
                  {data.members.map((m) => (
                    <div className="player" key={m.id}>
                      <span className="avatar">
                        {m.name.charAt(0).toUpperCase()}
                      </span>
                      <span>
                        <b>{m.name}</b>
                        <small>#{m.shortId}</small>
                      </span>
                      {data.host && (
                        <button
                          className="icon-button"
                          aria-label={"Loại " + m.name}
                          disabled={busy || connectionBlocked}
                          onClick={() => action("kick", { playerId: m.id })}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="lobby-bottom">
                {data.host ? (
                  <>
                    <button
                      className="button outline"
                      disabled={busy || connectionBlocked}
                      onClick={() => action("lock")}
                    >
                      {data.locked ? <Unlock size={18} /> : <Lock size={18} />}{" "}
                      {data.locked ? "Mở khóa" : "Khóa phòng"}
                    </button>
                    <button
                      className="button"
                      disabled={
                        busy ||
                        connectionBlocked ||
                        (!isExam && !data.members.length)
                      }
                      onClick={() => action("start")}
                    >
                      <Play size={18} />
                      {isExam
                        ? `Mở đề · Tính giờ (${Math.max(1, Math.round((data.durationSeconds || 60) / 60))} phút)`
                        : "Bắt đầu chơi"}
                    </button>
                  </>
                ) : isExam ? (
                  <div>
                    <p className="waiting">
                      <span className="pulse" />
                      Đang đợi chủ phòng mở đề (
                      {Math.max(
                        1,
                        Math.round((data.durationSeconds || 60) / 60),
                      )}{" "}
                      phút). Bạn đã sẵn sàng!
                    </p>
                    <p className="muted" style={{ marginTop: 6 }}>
                      Thời gian làm bài chỉ bắt đầu tính khi chủ phòng bấm mở
                      đề. Màn hình sẽ tự chuyển vào bài làm ngay khi đề mở.
                    </p>
                  </div>
                ) : (
                  <p className="waiting">
                    <span className="pulse" />
                    Chờ chủ trì bắt đầu. Bạn đã sẵn sàng!
                  </p>
                )}
              </div>
            </section>
          </div>
        </>
      ) : data.status === "OPEN" ? (
        data.host ? (
          <>
            <div className="quiz-top room-top">
              <span>
                Phòng thi tự động · {data.submittedCount || 0}/
                {data.members.length} người đã nộp bài
              </span>
              <Timer
                deadline={data.deadline}
                serverTime={data.serverTime}
                totalMs={data.deadline - data.openedAt}
                onEnd={handleExamTimerEnd}
              />
            </div>
            <div className="lobby-grid">
              <section className="lobby-code">
                <span>MÃ THAM GIA</span>
                <strong>{code}</strong>
                <p>
                  Người chơi vào link hoặc nhập mã là làm bài ngay. Bạn không
                  cần giữ trang này mở — hết giờ hệ thống tự chấm và trả lời
                  giải.
                </p>
                {origin && (
                  <QRCodeSVG
                    value={origin + "/?room=" + code}
                    size={132}
                    marginSize={2}
                  />
                )}
                <button
                  className="button outline"
                  onClick={() =>
                    navigator.clipboard
                      .writeText(origin + "/?room=" + code)
                      .then(() => {
                        setCopied(true);
                      })
                      .catch(() =>
                        setError(
                          "Không sao chép được. Hãy dùng mã phòng ở trên.",
                        ),
                      )
                  }
                >
                  <Copy size={17} />
                  {copied ? "Đã sao chép" : "Sao chép liên kết"}
                </button>
              </section>
              <section className="lobby-players">
                <div className="section-heading">
                  <h2>
                    <Users size={24} /> {data.members.length} người đang tham
                    gia
                  </h2>
                  {data.locked && <span className="badge">Đã khóa vào mới</span>}
                </div>
                {data.members.length === 0 ? (
                  <p className="empty">
                    Chia sẻ mã phòng hoặc QR để người chơi vào làm bài ngay…
                  </p>
                ) : (
                  <div className="player-grid">
                    {data.members.map((m) => (
                      <div className="player" key={m.id}>
                        <span className="avatar">
                          {m.name.charAt(0).toUpperCase()}
                        </span>
                        <span>
                          <b>{m.name}</b>
                          <small>
                            #{m.shortId} ·{" "}
                            {m.submitted ? "Đã nộp bài" : "Đang làm bài"}
                          </small>
                        </span>
                        <button
                          className="icon-button"
                          aria-label={"Loại " + m.name}
                          disabled={busy || connectionBlocked}
                          onClick={() => action("kick", { playerId: m.id })}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="lobby-bottom">
                  <button
                    className="button outline"
                    disabled={busy || connectionBlocked}
                    onClick={() => action("lock")}
                  >
                    {data.locked ? <Unlock size={18} /> : <Lock size={18} />}{" "}
                    {data.locked ? "Mở nhận thêm người" : "Khóa nhận thêm người"}
                  </button>
                  <button
                    className="button danger-outline"
                    disabled={busy || connectionBlocked}
                    onClick={() => setEndConfirm(true)}
                  >
                    Kết thúc sớm & trả kết quả
                  </button>
                </div>
              </section>
            </div>
          </>
        ) : data.mySubmitted ? (
          <>
            <div className="quiz-top room-top">
              <span>Đã chốt bài làm của bạn</span>
              <Timer
                deadline={data.deadline}
                serverTime={data.serverTime}
                totalMs={data.deadline - data.openedAt}
                onEnd={handleExamTimerEnd}
              />
            </div>
            <section className="question-panel live-question">
              <h2>Đã ghi nhận bài làm của bạn!</h2>
              <p className="muted">
                Hệ thống đang đợi đồng hồ chung của phòng kết thúc để tránh lộ
                đáp án sớm. Ngay khi hết giờ, điểm số, bảng xếp hạng và lời giải
                chi tiết từng câu sẽ tự động hiển thị tại đây.
              </p>
              <p className="waiting">
                <span className="pulse" />
                Đang chờ hết thời gian cài đặt để nhận kết quả và lời giải…
              </p>
            </section>
          </>
        ) : !currentExamQ ? (
          <Loading />
        ) : (
          <>
            <div className="quiz-top room-top">
              <span>
                Câu {safeExamIndex + 1} / {examQuestions.length} · Đã chọn{" "}
                {answeredCount}/{examQuestions.length} câu
              </span>
              <Timer
                deadline={data.deadline}
                serverTime={data.serverTime}
                totalMs={data.deadline - data.openedAt}
                onEnd={handleExamTimerEnd}
              />
            </div>
            <div
              className="progress"
              role="progressbar"
              aria-label="Tiến độ làm bài"
              aria-valuemin={0}
              aria-valuemax={examQuestions.length}
              aria-valuenow={answeredCount}
            >
              <span
                style={{
                  transform: `scaleX(${examQuestions.length ? answeredCount / examQuestions.length : 0})`,
                }}
              />
            </div>
            <div className="quiz-layout">
              <section className="question-panel">
                <div className="question-heading">
                  <span>
                    CÂU {String(safeExamIndex + 1).padStart(2, "0")}
                  </span>
                  <button
                    className={`button ghost small ${examFlagged.includes(currentExamQ.id) ? "flagged" : ""}`}
                    disabled={busy || connectionBlocked || !online}
                    onClick={() =>
                      void saveExamAnswer({
                        questionId: currentExamQ.id,
                        flagged: !examFlagged.includes(currentExamQ.id),
                      })
                    }
                  >
                    <Flag size={17} />
                    {examFlagged.includes(currentExamQ.id)
                      ? "Đã đánh dấu"
                      : "Xem lại sau"}
                  </button>
                </div>
                <div className="question-transition" key={currentExamQ.id}>
                  <FairPlay endpoint={`/rooms/${code}/integrity`} active>
                    <h2>{currentExamQ.text}</h2>
                    {currentExamQ.imageUrl && (
                      <img
                        decoding="async"
                        fetchPriority="high"
                        referrerPolicy="no-referrer"
                        className="question-image"
                        src={currentExamQ.imageUrl}
                        alt="Hình minh họa câu hỏi"
                      />
                    )}
                    <Answers
                      question={currentExamQ}
                      selected={examAnswers[currentExamQ.id]}
                      reveal={false}
                      disabled={
                        busy || connectionBlocked || !online || submitConfirm
                      }
                      shortcuts
                      onSelect={(choice) =>
                        void saveExamAnswer({
                          questionId: currentExamQ.id,
                          answer: choice,
                        })
                      }
                    />
                  </FairPlay>
                </div>
                <div className="question-nav">
                  <button
                    className="button outline"
                    disabled={safeExamIndex === 0 || busy}
                    onClick={() => setExamIndex((i) => Math.max(0, i - 1))}
                  >
                    <ArrowLeft size={18} />
                    Câu trước
                  </button>
                  <span className="muted">
                    {busy
                      ? "Đang lưu…"
                      : error
                        ? "Chưa xác nhận lưu — hãy chọn lại"
                        : "Đã tự động lưu đáp án"}
                  </span>
                  <button
                    className="button"
                    disabled={
                      safeExamIndex === examQuestions.length - 1 || busy
                    }
                    onClick={() =>
                      setExamIndex((i) =>
                        Math.min(examQuestions.length - 1, i + 1),
                      )
                    }
                  >
                    Câu tiếp <ArrowRight size={18} />
                  </button>
                </div>
              </section>
              <aside className="question-sidebar">
                <h3>Tiến độ của bạn</h3>
                <div className="progress-summary">
                  <strong>
                    {answeredCount}
                    <small> / {examQuestions.length}</small>
                  </strong>
                  <span>đã chọn · {examFlagged.length} đánh dấu</span>
                </div>
                <div className="question-numbers">
                  {examQuestions.map((x, i) => (
                    <button
                      key={x.id}
                      aria-label={`Đến câu ${i + 1}`}
                      aria-current={i === safeExamIndex ? "step" : undefined}
                      disabled={busy}
                      className={`${i === safeExamIndex ? "current" : ""} ${examAnswers[x.id] !== undefined ? "answered" : ""} ${examFlagged.includes(x.id) ? "flagged" : ""}`}
                      onClick={() => setExamIndex(i)}
                    >
                      {i + 1}
                      {examFlagged.includes(x.id) && <Flag size={10} />}
                    </button>
                  ))}
                </div>
                <p className="muted">
                  Bạn có thể đổi đáp án tự do trước khi nộp. Khi đồng hồ kết
                  thúc, hệ thống tự động chấm điểm và mở lời giải từng câu.
                </p>
                <button
                  className="button wide"
                  disabled={busy || connectionBlocked || !online}
                  onClick={() => setSubmitConfirm(true)}
                >
                  Chốt nộp bài <CheckCircle size={18} />
                </button>
              </aside>
            </div>
          </>
        )
      ) : data.status === "FINISHED" ? (
        <>
          <div className="finish-moment">
            <Celebration />
            <span className="finish-medallion">
              <Trophy size={32} />
            </span>
            <p>
              {data.personalReplay
                ? "Nhìn lại lượt luyện của bạn"
                : "Cùng nhìn lại kết quả và lời giải chi tiết"}
            </p>
          </div>
          {myRank && (
            <section className="result-banner">
              <CheckCircle size={48} />
              <div>
                <span>Kết quả của bạn</span>
                <h2>
                  {myRank.score.toFixed(2)}
                  <small>/ 100</small>
                </h2>
              </div>
              <div>
                <b>
                  {myRank.correct}/{data.count}
                </b>
                <span>Câu trả lời đúng</span>
              </div>
              <div>
                <b>
                  #{myRank.rank}/{data.ranking.length}
                </b>
                <span>Thứ hạng trong phòng</span>
              </div>
              <div>
                <b>{duration(myRank.durationMs)}</b>
                <span>Thời gian làm bài</span>
              </div>
            </section>
          )}
          <Ranking rows={data.ranking} mine={actor?.id} podium />
          <div className="actions">
            {data.replayAvailable && (
              <button
                className="button"
                disabled={busy || !online}
                onClick={async () => {
                  if (sending.current) return;
                  sending.current = true;
                  setBusy(true);
                  setError("");
                  try {
                    const next = await api<{ id: string }>(
                      `/rooms/${code}/replay`,
                      "POST",
                      {},
                    );
                    router.push(`/room/${next.id}`);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    sending.current = false;
                    setBusy(false);
                  }
                }}
              >
                {busy
                  ? "Đang mở lượt luyện…"
                  : data.replayRoomId
                    ? "Mở lại lượt luyện tiếp"
                    : "Chơi lại 10 câu ngẫu nhiên khác"}
                <ArrowRight size={18} />
              </button>
            )}
            <Link className="button outline" href="/">
              Tiếp tục luyện tập <ArrowRight size={18} />
            </Link>
            {data.host && (
              <Link
                className="button outline"
                href={"/admin/reports?room=" + code}
              >
                Xem báo cáo
              </Link>
            )}
          </div>
          {data.replayAvailable && (
            <p className="muted">
              Lượt luyện riêng bắt đầu ngay, không trùng 10 câu vừa làm. Giữ
              không giới hạn thời gian và tự bấm chuyển câu sau lời giải.
            </p>
          )}
          {data.replayReason && <p className="muted">{data.replayReason}</p>}
          {data.host && !!data.details?.length && (
            <label>
              Xem bài làm của sinh viên
              <select
                value={reviewPlayer}
                onChange={(event) => setReviewPlayer(event.target.value)}
              >
                <option value="">Chọn một sinh viên để xem chi tiết</option>
                {data.details.map((detail) => (
                  <option key={detail.playerId} value={detail.playerId}>
                    {detail.name} · #{detail.playerId.slice(0, 6)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {data.details
            ?.filter((detail) => !data.host || detail.playerId === reviewPlayer)
            .map((d) => (
              <section key={d.playerId}>
                <h2 className="section-label">
                  Bài làm & lời giải chi tiết ({d.name})
                </h2>
                {d.questions.map((x) => (
                  <Review
                    key={x.question.id}
                    question={x.question}
                    selected={x.answer}
                  />
                ))}
              </section>
            ))}
        </>
      ) : (
        <>
          <div className="quiz-top room-top">
            <span>
              Câu {data.current + 1} / {data.count}
            </span>
            {data.status === "QUESTION" && data.untimed ? (
              <span className="badge">Không giới hạn thời gian</span>
            ) : data.status === "QUESTION" ? (
              <Timer
                deadline={data.deadline}
                serverTime={data.serverTime}
                totalMs={data.deadline - data.openedAt}
                onEnd={() => {
                  setExpiredQuestion(data.question?.id || "");
                  void refresh();
                }}
              />
            ) : (
              <span className="badge">Đã đóng câu hỏi</span>
            )}
            <span>
              {data.answered}/{data.members.length} đã trả lời
            </span>
          </div>
          <div
            className="progress"
            role="progressbar"
            aria-label="Tiến độ phòng"
            aria-valuemin={0}
            aria-valuemax={data.count}
            aria-valuenow={data.current + 1}
          >
            <span
              style={{
                transform: `scaleX(${(data.current + 1) / data.count})`,
              }}
            />
          </div>
          <section
            ref={stage}
            className="question-panel live-question question-transition"
            key={data.question?.id}
          >
            <FairPlay
              endpoint={`/rooms/${code}/integrity`}
              active={data.status === "QUESTION" && !data.host}
            >
              <h2>{data.question?.text}</h2>
              {data.question?.imageUrl && (
                <img
                  decoding="async"
                  fetchPriority="high"
                  referrerPolicy="no-referrer"
                  className="question-image"
                  src={data.question.imageUrl}
                  alt="Hình minh họa câu hỏi"
                />
              )}
              {data.question && (
                <Answers
                  question={data.question}
                  selected={data.myAnswer}
                  reveal={data.status === "REVEAL"}
                  disabled={
                    busy ||
                    connectionBlocked ||
                    !online ||
                    expiredQuestion === data.question.id ||
                    data.myAnswer >= 0 ||
                    data.host
                  }
                  shortcuts={!data.host}
                  onSelect={(choice) => void answer(choice)}
                />
              )}
            </FairPlay>
            {data.status === "QUESTION" &&
              expiredQuestion === data.question?.id && (
                <Toast className="saved">
                  <span>Hết thời gian · Đang nhận kết quả từ máy chủ…</span>
                </Toast>
              )}
            {busy && !data.host && data.status === "QUESTION" && (
              <Toast className="saved">
                <span>Đang gửi đáp án…</span>
              </Toast>
            )}
            {data.myAnswer >= 0 && data.status === "QUESTION" && (
              <Toast className="saved">
                <Check size={18} />
                <span>Đã gửi đáp án. Cùng chờ kết quả nhé!</span>
              </Toast>
            )}
            {data.status === "REVEAL" && (
              <>
                {!data.host && (
                  <Feedback
                    eventKey={`${code}:${data.question?.id}`}
                    outcome={
                      data.myAnswer < 0
                        ? "blank"
                        : data.myAnswer === data.question?.correct
                          ? "correct"
                          : "wrong"
                    }
                  >
                    <p>
                      Đáp án đúng:{" "}
                      <b>
                        {data.question?.correct !== undefined
                          ? `${"ABCD"[data.question.correct]}. ${data.question.options[data.question.correct]}`
                          : ""}
                      </b>
                    </p>
                  </Feedback>
                )}
                <p className="explanation">
                  <strong>Giải thích: </strong>
                  {data.question?.explanation}
                </p>
                {!data.host && (
                  <div className="actions ready-bar" aria-live="polite">
                    <button
                      className="button"
                      disabled={
                        busy || connectionBlocked || !online || data.myReady
                      }
                      onClick={() => void readyForNext()}
                    >
                      {data.myReady
                        ? "Đã sẵn sàng"
                        : busy
                          ? "Đang gửi…"
                          : data.current + 1 === data.count
                            ? "Đã đọc xong · Xem tổng kết"
                            : "Đã đọc xong · Câu tiếp theo"}
                      {data.myReady ? (
                        <Check size={18} />
                      ) : (
                        <ArrowRight size={18} />
                      )}
                    </button>
                    <p className="muted">
                      {data.advanceWhenReady
                        ? data.myReady
                          ? "Bạn đã sẵn sàng. Chờ những người còn lại đọc xong."
                          : "Đọc xong rồi bấm. Phòng chuyển khi tất cả người chơi sẵn sàng."
                        : data.myReady
                          ? "Đã báo chủ trì. Đang chờ chuyển câu."
                          : "Đọc lời giải theo nhịp của bạn, rồi báo chủ trì khi sẵn sàng."}
                    </p>
                  </div>
                )}
                <div className="distribution">
                  {data.distribution?.map((n, i) => (
                    <div key={i}>
                      <span>{"ABCD"[i]}</span>
                      <div>
                        <span
                          style={{
                            width: `${data.members.length ? (n / data.members.length) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <b>{n}</b>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
          {data.host ? (
            <div className="host-controls">
              <button
                className="button danger-outline"
                disabled={busy || connectionBlocked}
                onClick={() => setEndConfirm(true)}
              >
                Kết thúc sớm
              </button>
              <p role="status">
                {data.status === "REVEAL"
                  ? `${data.readyPlayers?.length || 0}/${data.members.length} người đã đọc xong`
                  : `${data.answered}/${data.members.length} người đã trả lời`}
              </p>
              {data.status === "REVEAL" && (
                <button
                  className="button"
                  disabled={busy || connectionBlocked}
                  onClick={() => action("next")}
                >
                  {data.current + 1 === data.count
                    ? "Xem tổng kết"
                    : "Câu tiếp theo"}
                  <ArrowRight size={18} />
                </button>
              )}
            </div>
          ) : (
            data.status === "REVEAL" && (
              <p className="waiting">
                <span className="pulse" />
                {data.myReady
                  ? "Đã sẵn sàng cho câu tiếp theo."
                  : "Hãy bấm “Đã đọc xong” sau khi xem lời giải."}
              </p>
            )
          )}
        </>
      )}
      {submitConfirm && (
        <GameDialog
          titleId="submit-exam-title"
          busy={busy}
          onClose={() => setSubmitConfirm(false)}
        >
          <h2 id="submit-exam-title">Chốt nộp bài ngay?</h2>
          <p>
            Bạn đã chọn {answeredCount}/{examQuestions.length} câu. Sau khi nộp,
            hệ thống chốt thời gian làm bài của bạn và mở kết quả kèm lời giải
            ngay khi phòng hết giờ.
          </p>
          <div className="actions">
            <button
              className="button outline"
              onClick={() => setSubmitConfirm(false)}
            >
              Tiếp tục kiểm tra lại
            </button>
            <button
              className="button"
              disabled={busy}
              onClick={() => void submitExamNow()}
            >
              Xác nhận nộp bài
            </button>
          </div>
        </GameDialog>
      )}
      {endConfirm && (
        <GameDialog
          titleId="end-room-title"
          busy={busy}
          onClose={() => setEndConfirm(false)}
        >
          <h2 id="end-room-title">Kết thúc phòng ngay?</h2>
          <p>
            {isExam
              ? "Hệ thống sẽ chốt điểm dựa trên các đáp án người chơi đã chọn và trả kết quả kèm lời giải ngay lập tức."
              : "Kết quả sẽ tính trên những câu đã mở."}
          </p>
          <div className="actions">
            <button
              className="button outline"
              onClick={() => setEndConfirm(false)}
            >
              Quay lại
            </button>
            <button
              className="button danger"
              disabled={busy || connectionBlocked}
              onClick={() => action("finish")}
            >
              Kết thúc phòng
            </button>
          </div>
        </GameDialog>
      )}
    </div>
  );
}
