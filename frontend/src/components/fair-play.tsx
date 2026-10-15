"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useSession } from "./shared";

export function FairPlay({
  endpoint,
  children,
  active = true,
}: {
  endpoint: string;
  children: ReactNode;
  active?: boolean;
}) {
  const { actor } = useSession();
  const [notice, setNotice] = useState("");
  const [concealed, setConcealed] = useState(false);
  const lastCopy = useRef(0);
  useEffect(() => {
    if (!active) return;
    let wasFull = Boolean(document.fullscreenElement);
    const send = (kind: string) => {
      void api(
        endpoint,
        "POST",
        { eventId: crypto.randomUUID(), kind },
        { keepalive: true },
      ).catch(() => {});
    };
    const hidden = () => {
      setConcealed(document.visibilityState === "hidden");
      if (document.visibilityState !== "hidden") return;
      setNotice(
        "Bạn vừa rời trang. Hãy quay lại tập trung làm bài; đồng hồ vẫn tiếp tục chạy.",
      );
      send("TAB_HIDDEN");
    };
    const fullscreen = () => {
      const full = Boolean(document.fullscreenElement);
      if (wasFull && !full) {
        setNotice(
          "Bạn đã thoát toàn màn hình. Bạn có thể bật lại để tập trung; không tự trừ điểm.",
        );
        send("FULLSCREEN_EXIT");
      }
      wasFull = full;
    };
    setConcealed(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", hidden);
    document.addEventListener("fullscreenchange", fullscreen);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      document.removeEventListener("fullscreenchange", fullscreen);
    };
  }, [endpoint, active]);
  function block(e: { preventDefault(): void }) {
    e.preventDefault();
    setNotice("Sao chép nội dung đang được hạn chế trong lượt làm này.");
    if (Date.now() - lastCopy.current < 1000) return;
    lastCopy.current = Date.now();
    void api(endpoint, "POST", {
      eventId: crypto.randomUUID(),
      kind: "COPY_BLOCKED",
    }).catch(() => {});
  }
  if (!active) return <>{children}</>;
  return (
    <div className="fair-play">
      <p className="fair-play-notice">
        <ShieldCheck size={18} /> Chế độ tập trung: hạn chế sao chép; số lần rời
        trang và thoát toàn màn hình được ghi nhận để người quản lý xem xét,
        không tự trừ điểm.
      </p>
      {notice && (
        <p role="status" className="fair-play-warning">
          <span>{notice}</span>
          <button
            type="button"
            aria-label="Ẩn thông báo tập trung"
            onClick={() => setNotice("")}
          >
            Đã hiểu
          </button>
        </p>
      )}
      <div
        className="protected-question"
        data-concealed={concealed ? "true" : "false"}
        onCopy={block}
        onCut={block}
        onContextMenu={block}
        onDragStart={block}
      >
        <p className="question-watermark">
          VJU Quiz · {actor?.name} · #{actor?.id.slice(0, 6)}
        </p>
        {children}
      </div>
    </div>
  );
}
