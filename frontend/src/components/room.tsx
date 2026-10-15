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
} from "lucide-react";
import { api } from "@/lib/api";
import { Room } from "@/lib/types";
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
  const { actor, ready } = useSession();
  const [data, setData] = useState<Room | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [copied, setCopied] = useState(false);
  const [endConfirm, setEndConfirm] = useState(false);
  const [origin, setOrigin] = useState("");
  const ref = useRef<Room | null>(null);
  const fetching = useRef(false);
  const apply = (r: Room) => {
    if (!ref.current || r.version >= ref.current.version) {
      ref.current = r;
      setData(r);
    }
  };
  async function refresh() {
    if (fetching.current) return;
    fetching.current = true;
    try {
      apply(await api<Room>("/rooms/" + code));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      fetching.current = false;
    }
  }
  useEffect(() => {
    setOrigin(window.location.origin);
    if (!actor) return;
    void refresh();
    const url =
      process.env.NEXT_PUBLIC_WS_URL ||
      `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
    const client = new Client({
      brokerURL: url,
      connectHeaders: { "X-CSRF-Token": actor.csrf },
      reconnectDelay: 2000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      onConnect: () => {
        setConnected(true);
        client.subscribe("/topic/rooms/" + code, () => void refresh());
        void refresh();
      },
      onWebSocketClose: () => setConnected(false),
      onStompError: () => setConnected(false),
    });
    client.activate();
    const poll = setInterval(() => void refresh(), 4000);
    return () => {
      clearInterval(poll);
      void client.deactivate();
    };
  }, [actor, code]);
  async function action(action: string, body: unknown = {}) {
    setBusy(true);
    setError("");
    try {
      apply(await api<Room>(`/admin/rooms/${code}/${action}`, "POST", body));
      setEndConfirm(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
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
          {connected ? <Wifi size={16} /> : <WifiOff size={16} />}{" "}
          {connected ? "Trực tiếp" : "Đang kết nối lại"}
        </span>
      </PageTitle>
      <ErrorNote error={error} />
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
                          disabled={busy}
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
                      disabled={busy}
                      onClick={() => action("lock")}
                    >
                      {data.locked ? <Unlock size={18} /> : <Lock size={18} />}{" "}
                      {data.locked ? "Mở khóa" : "Khóa phòng"}
                    </button>
                    <button
                      className="button"
                      disabled={busy || !data.members.length}
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
          {data.details?.map((d) => (
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
            {data.status === "QUESTION" ? (
              <Timer deadline={data.deadline} serverTime={data.serverTime} />
            ) : (
              <span className="badge">Đã đóng câu hỏi</span>
            )}
            <span>
              {data.answered}/{data.members.length} đã trả lời
            </span>
          </div>
          <section className="question-panel live-question">
            <h2>{data.question?.text}</h2>
            {data.question?.imageUrl && (
              <img
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
                disabled={busy || data.myAnswer >= 0 || data.host}
                onSelect={async (answer) => {
                  setBusy(true);
                  try {
                    apply(
                      await api<Room>(`/rooms/${code}/answer`, "POST", {
                        questionId: data.question!.id,
                        answer,
                      }),
                    );
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            )}
            {data.myAnswer >= 0 && data.status === "QUESTION" && (
              <p className="saved">
                <Check size={18} />
                Đã gửi đáp án. Cùng chờ kết quả nhé!
              </p>
            )}
            {data.status === "REVEAL" && (
              <>
                <p className="explanation">
                  <strong>Giải thích: </strong>
                  {data.question?.explanation}
                </p>
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
              <button
                className="button danger-outline"
                disabled={busy}
                onClick={() => setEndConfirm(true)}
              >
                Kết thúc sớm
              </button>
              {data.status === "REVEAL" && (
                <button
                  className="button"
                  disabled={busy}
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
                Chờ chủ trì chuyển câu tiếp theo.
              </p>
            )
          )}
        </>
      )}
      {endConfirm && (
        <div className="modal-backdrop">
          <section role="dialog" aria-modal="true" className="modal">
            <h2>Kết thúc phòng ngay?</h2>
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
                disabled={busy}
                onClick={() => action("finish")}
              >
                Kết thúc phòng
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
