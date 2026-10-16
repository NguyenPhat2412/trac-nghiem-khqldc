"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Client } from "@stomp/stompjs";
import { QRCodeSVG } from "qrcode.react";
import {
  Users,
  Lock,
  Unlock,
  Play,
  ArrowRight,
  Check,
  Copy,
  Wifi,
  WifiOff,
  Trophy,
} from "lucide-react";
import { api } from "@/lib/api";
import { Room } from "@/lib/types";
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
  ErrorNote,
  Loading,
  PageTitle,
  Ranking,
  Review,
  Timer,
  useSession,
} from "./shared";
export function RoomPage({ code }: { code: string }) {
  const { online, play } = useGame();
  const { actor, ready } = useSession();
  const [data, setData] = useState<Room | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connectionBlocked, setConnectionBlocked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [endConfirm, setEndConfirm] = useState(false);
  const [origin, setOrigin] = useState("");
  const [expiredQuestion, setExpiredQuestion] = useState("");
  const [reviewPlayer, setReviewPlayer] = useState("");
  const finished = data?.id === code && data.status === "FINISHED";
  const sending = useRef(false);
  const ref = useRef<Room | null>(null);
  const fetching = useRef(false);
  const refreshPending = useRef(false);
  const connectionDenied = useRef(false);
  const apply = (r: Room) => {
    if (!ref.current || r.version >= ref.current.version) {
      ref.current = r;
      setData(r);
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
    try {
      const next = await api<Room>("/rooms/" + code);
      if (connectionDenied.current) return;
      apply(next);
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
  async function action(action: string, body: unknown = {}) {
    if (sending.current || connectionDenied.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      apply(await api<Room>(`/admin/rooms/${code}/${action}`, "POST", body));
      setEndConfirm(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      sending.current = false;
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
  return (
    <>
      <GameToolbar />
      <PageTitle
        title={
          data.status === "FINISHED" ? "Một hành trình thật tuyệt!" : data.title
        }
        subtitle={
          data.status === "FINISHED"
            ? data.early
              ? "Phòng đã kết thúc sớm · Điểm tính trên các câu đã mở"
              : "Tổng kết phòng chơi"
            : `Phòng ${code} · ${data.members.length} người chơi`
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
        <p className="muted">
          {data.untimed
            ? "Không giới hạn thời gian trả lời."
            : "Trả lời theo thời gian của bộ quiz."}{" "}
          {data.advanceWhenReady
            ? "Chuyển câu khi tất cả người chơi bấm “Đã đọc xong”."
            : "Chủ trì điều khiển chuyển câu."}
        </p>
      )}
      {connectionBlocked && (
        <button
          className="button outline"
          onClick={() => window.location.reload()}
        >
          Tải lại trang
        </button>
      )}
      {data.shuffleAnswers && data.status !== "FINISHED" && (
        <p className="muted">
          Vị trí A/B/C/D được đảo riêng cho mỗi người. Hãy trả lời theo nội
          dung.
        </p>
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
                {data.locked && <span className="badge">Đã khóa</span>}
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
                        busy || connectionBlocked || !data.members.length
                      }
                      onClick={() => action("start")}
                    >
                      <Play size={18} />
                      Bắt đầu chơi
                    </button>
                  </>
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
      ) : data.status === "FINISHED" ? (
        <>
          <div className="finish-moment">
            <Celebration />
            <span className="finish-medallion">
              <Trophy size={32} />
            </span>
            <p>Cùng nhìn lại thành quả của cả lớp</p>
          </div>
          <Ranking rows={data.ranking} mine={actor?.id} podium />
          <div className="actions">
            <Link className="button" href="/">
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
                <h2 className="section-label">Bài làm của {d.name}</h2>
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
          <div className="quiz-top">
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
                <p className="saved" role="status">
                  Hết thời gian · Đang nhận kết quả từ máy chủ…
                </p>
              )}
            {busy && !data.host && data.status === "QUESTION" && (
              <p className="saved" role="status">
                Đang gửi đáp án…
              </p>
            )}
            {data.myAnswer >= 0 && data.status === "QUESTION" && (
              <p className="saved">
                <Check size={18} />
                Đã gửi đáp án. Cùng chờ kết quả nhé!
              </p>
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
                  <div className="actions" aria-live="polite">
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
          {data.status === "REVEAL" && (
            <>
              <h2 className="section-label">Thứ hạng hiện tại</h2>
              <Ranking rows={data.ranking} mine={actor?.id} />
            </>
          )}
          {data.host ? (
            <div className="host-controls">
              {data.status === "REVEAL" && (
                <p role="status">
                  {data.readyPlayers?.length || 0}/{data.members.length} người
                  đã đọc xong
                </p>
              )}
              <button
                className="button danger-outline"
                disabled={busy || connectionBlocked}
                onClick={() => setEndConfirm(true)}
              >
                Kết thúc sớm
              </button>
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
      {endConfirm && (
        <GameDialog
          titleId="end-room-title"
          busy={busy}
          onClose={() => setEndConfirm(false)}
        >
          <h2 id="end-room-title">Kết thúc phòng ngay?</h2>
          <p>Kết quả sẽ tính trên những câu đã mở.</p>
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
    </>
  );
}
