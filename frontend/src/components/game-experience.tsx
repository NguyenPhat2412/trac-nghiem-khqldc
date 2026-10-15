"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Check,
  CircleHelp,
  Keyboard,
  Maximize,
  Minimize,
  Sparkles,
  Volume2,
  VolumeX,
  WifiOff,
  X,
} from "lucide-react";

type Cue = "correct" | "wrong" | "saved" | "finish";
type Preferences = { sound: boolean; effects: boolean; shortcuts: boolean };
const defaults: Preferences = { sound: false, effects: true, shortcuts: false };
const GameContext = createContext({
  ...defaults,
  online: true,
  setPreference: (_key: keyof Preferences, _value: boolean) => {},
  play: (_cue: Cue) => {},
});
export const useGame = () => useContext(GameContext);

export function GameProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState(defaults);
  const [online, setOnline] = useState(true);
  const [ready, setReady] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  useEffect(() => {
    let stored: Partial<Preferences> = {};
    try {
      stored = JSON.parse(localStorage.getItem("vju-game-preferences") || "{}");
    } catch {}
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    setPrefs({
      sound: stored?.sound === true,
      shortcuts: stored?.shortcuts === true,
      effects: !reduced.matches && stored?.effects !== false,
    });
    setReady(true);
    const updateOnline = () => setOnline(navigator.onLine);
    const updateMotion = () => {
      if (reduced.matches) setPrefs((p) => ({ ...p, effects: false }));
    };
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    reduced.addEventListener("change", updateMotion);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
      reduced.removeEventListener("change", updateMotion);
      void audio.current?.close().catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (ready)
      try {
        localStorage.setItem("vju-game-preferences", JSON.stringify(prefs));
      } catch {}
  }, [prefs, ready]);
  const play = useCallback(
    (cue: Cue, force = false) => {
      if ((!prefs.sound && !force) || document.visibilityState === "hidden")
        return;
      try {
        const ctx = audio.current || (audio.current = new AudioContext());
        void ctx
          .resume()
          .then(() => {
            const notes = {
              correct: [523, 659, 784],
              wrong: [294, 247],
              saved: [523],
              finish: [523, 659, 784, 1047],
            }[cue];
            notes.forEach((frequency, i) => {
              const oscillator = ctx.createOscillator(),
                gain = ctx.createGain();
              const time = ctx.currentTime + i * 0.1;
              oscillator.frequency.value = frequency;
              oscillator.type = "sine";
              gain.gain.setValueAtTime(0, time);
              gain.gain.linearRampToValueAtTime(0.045, time + 0.015);
              gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
              oscillator.connect(gain);
              gain.connect(ctx.destination);
              oscillator.start(time);
              oscillator.stop(time + 0.2);
              oscillator.onended = () => {
                oscillator.disconnect();
                gain.disconnect();
              };
            });
          })
          .catch(() => {});
      } catch {
        /* Audio is optional; unsupported browsers keep normal gameplay. */
      }
    },
    [prefs.sound],
  );
  const setPreference = (key: keyof Preferences, value: boolean) => {
    setPrefs((p) => ({ ...p, [key]: value }));
    if (key === "sound" && value) play("saved", true);
  };
  return (
    <GameContext.Provider value={{ ...prefs, online, setPreference, play }}>
      <div className="game-root" data-effects={prefs.effects ? "on" : "off"}>
        {!online && (
          <div className="network-banner" role="status">
            <WifiOff size={18} /> Mất kết nối. Đáp án mới chưa thể gửi; đồng hồ
            máy chủ vẫn chạy. Trang sẽ đồng bộ khi có mạng.
          </div>
        )}
        {children}
      </div>
    </GameContext.Provider>
  );
}

export function GameToolbar() {
  const { sound, effects, shortcuts, setPreference } = useGame();
  const [full, setFull] = useState(false);
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setSupported(Boolean(document.fullscreenEnabled));
    const changed = () => setFull(Boolean(document.fullscreenElement));
    changed();
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);
  async function fullscreen() {
    try {
      setError("");
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setError(
        "Trình duyệt chưa cho phép toàn màn hình. Bạn vẫn làm bài bình thường.",
      );
    }
  }
  return (
    <div className="game-toolbar-wrap">
      <div
        className="game-toolbar"
        role="group"
        aria-label="Tùy chọn trải nghiệm"
      >
        <button
          aria-pressed={sound}
          onClick={() => setPreference("sound", !sound)}
        >
          {sound ? <Volume2 size={17} /> : <VolumeX size={17} />}Âm thanh{" "}
          <span>{sound ? "Bật" : "Tắt"}</span>
        </button>
        <button
          aria-pressed={effects}
          onClick={() => setPreference("effects", !effects)}
        >
          <Sparkles size={17} />
          Hiệu ứng <span>{effects ? "Bật" : "Tắt"}</span>
        </button>
        <button
          aria-pressed={shortcuts}
          title="Khi bật, dùng phím 1–4 để chọn đáp án"
          onClick={() => setPreference("shortcuts", !shortcuts)}
        >
          <Keyboard size={17} />
          Phím 1–4 <span>{shortcuts ? "Bật" : "Tắt"}</span>
        </button>
        {supported && (
          <button aria-pressed={full} onClick={() => void fullscreen()}>
            {full ? <Minimize size={17} /> : <Maximize size={17} />}
            {full ? "Thu nhỏ" : "Toàn màn hình"}
          </button>
        )}
      </div>
      {error && (
        <p role="status" className="muted">
          {error}
        </p>
      )}
    </div>
  );
}

export function Feedback({
  outcome,
  eventKey,
  children,
}: {
  outcome: "correct" | "wrong" | "blank";
  eventKey: string;
  children?: ReactNode;
}) {
  const { play } = useGame();
  const last = useRef("");
  useEffect(() => {
    if (last.current === eventKey) return;
    last.current = eventKey;
    if (outcome !== "blank") play(outcome);
  }, [eventKey, outcome, play]);
  return (
    <div
      key={eventKey}
      className={`instant-feedback feedback-${outcome}`}
      role="status"
    >
      <div className="feedback-heading">
        <span className="feedback-symbol">
          {outcome === "correct" ? (
            <Check />
          ) : outcome === "wrong" ? (
            <X />
          ) : (
            <CircleHelp />
          )}
        </span>
        <div>
          <strong>
            {outcome === "correct"
              ? "Chính xác!"
              : outcome === "wrong"
                ? "Chưa chính xác."
                : "Bạn chưa trả lời câu này."}
          </strong>
          <p>
            {outcome === "correct"
              ? "Thêm một kiến thức đã nắm vững."
              : "Đọc lại lời giải để nhớ lâu hơn nhé."}
          </p>
        </div>
      </div>
      {children}
    </div>
  );
}

export function Celebration() {
  const { play } = useGame();
  const played = useRef(false);
  useEffect(() => {
    if (!played.current) {
      played.current = true;
      play("finish");
    }
  }, [play]);
  return (
    <div className="celebration" aria-hidden="true">
      {Array.from({ length: 16 }, (_, i) => (
        <i key={i} style={{ "--piece": i } as React.CSSProperties} />
      ))}
    </div>
  );
}

export function GameDialog({
  titleId,
  busy,
  onClose,
  children,
}: {
  titleId: string;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="modal game-dialog"
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
          ),
        );
        const first = controls[0],
          last = controls[controls.length - 1];
        if (!first) {
          event.preventDefault();
          return;
        }
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      {children}
    </dialog>
  );
}
