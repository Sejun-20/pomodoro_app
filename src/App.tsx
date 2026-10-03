import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_SETTINGS,
  MAX_MINUTES,
  loadSettings,
  loadTimer,
  saveSettings,
  saveTimer,
  type Mode,
  type Settings,
  type TimerState,
} from "./storage";

const LABEL: Record<Mode, string> = { focus: "집중", short: "짧은 휴식", long: "긴 휴식" };
const COLOR: Record<Mode, string> = { focus: "#d62828", short: "#2f9e8f", long: "#3b7dd8" };
const minutes = (s: Settings, m: Mode) => s[m] * 60_000;

const CX = 150;
const CY = 150;
const DISK = 92; // 색 부채꼴 반지름

const polar = (r: number, deg: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)] as const;
};

/** 12시 방향에서 시계방향으로 남은 시간만큼 채운 부채꼴 (60분 = 360°) */
function wedge(remainingMs: number) {
  const deg = Math.min(MAX_MINUTES, Math.max(0, remainingMs / 60_000)) * 6;
  if (deg <= 0) return null;
  if (deg >= 360) return <circle cx={CX} cy={CY} r={DISK} className="wedge" />;
  const [x, y] = polar(DISK, deg);
  return (
    <path
      className="wedge"
      d={`M${CX} ${CY} L${CX} ${CY - DISK} A${DISK} ${DISK} 0 ${deg > 180 ? 1 : 0} 1 ${x} ${y} Z`}
    />
  );
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [timer, setTimer] = useState<TimerState>(() =>
    loadTimer({ mode: "focus", running: false, endAt: null, remaining: minutes(loadSettings(), "focus") }),
  );
  const [now, setNow] = useState(Date.now());
  const [showSettings, setShowSettings] = useState(false);
  const [flashing, setFlashing] = useState(false);
  const wakeLock = useRef<WakeLockSentinel | null>(null);

  const remaining = timer.running && timer.endAt ? Math.max(0, timer.endAt - now) : timer.remaining;

  useEffect(() => saveTimer(timer), [timer]);
  useEffect(() => saveSettings(settings), [settings]);

  // 종료 시각 기준으로 계산하므로 백그라운드에 다녀와도 정확하다.
  useEffect(() => {
    if (!timer.running) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [timer.running]);

  // 종료: 0에서 멈춘 채 대기. 휴식이 끝났을 때만 화면 깜빡임. 다음 단계로 자동 전환/시작하지 않는다.
  useEffect(() => {
    if (!timer.running || !timer.endAt || timer.endAt > now) return;
    setTimer((t) => ({ ...t, running: false, endAt: null, remaining: 0 }));
    if (timer.mode !== "focus" && settings.flash) setFlashing(true);
  }, [now, timer.running, timer.endAt, timer.mode, settings.flash]);

  // 실행 중에는 화면이 꺼지지 않게 한다.
  useEffect(() => {
    if (!timer.running) return;
    const request = async () => {
      try {
        wakeLock.current = (await navigator.wakeLock?.request("screen")) ?? null;
      } catch {
        /* 미지원/거부 */
      }
    };
    void request();
    const onVisible = () => {
      setNow(Date.now());
      if (document.visibilityState === "visible") void request();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void wakeLock.current?.release();
      wakeLock.current = null;
    };
  }, [timer.running]);

  const fresh = (mode: Mode, s = settings): TimerState => ({
    mode,
    running: false,
    endAt: null,
    remaining: minutes(s, mode),
  });

  const toggle = () => {
    const t0 = Date.now();
    setNow(t0);
    setTimer((t) => {
      if (t.running) return { ...t, running: false, endAt: null, remaining: Math.max(0, (t.endAt ?? t0) - t0) };
      const ms = t.remaining > 0 ? t.remaining : minutes(settings, t.mode); // 0에서 시작하면 처음부터
      return { ...t, running: true, endAt: t0 + ms, remaining: ms };
    });
  };
  const reset = () => setTimer(fresh(timer.mode));
  const pick = (m: Mode) => setTimer(fresh(m));

  const applySettings = (s: Settings) => {
    setSettings(s);
    setTimer((t) => (t.running ? t : { ...t, remaining: s[t.mode] * 60_000 }));
  };

  const labels = Array.from({ length: 12 }, (_, i) => i * 5);

  return (
    <main className="app" style={{ "--accent": COLOR[timer.mode] } as React.CSSProperties}>
      <header>
        <h1>
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="logo" />
          뽀모도로
        </h1>
        <button className="icon" aria-label="설정" onClick={() => setShowSettings(true)}>
          ⚙️
        </button>
      </header>

      <nav className="tabs">
        {(["focus", "short", "long"] as Mode[]).map((m) => (
          <button key={m} className={timer.mode === m ? "active" : ""} onClick={() => pick(m)}>
            {LABEL[m]}
          </button>
        ))}
      </nav>

      <section className="timer-body" aria-label={`${LABEL[timer.mode]} 타이머`}>
        <i className={`led ${timer.running ? "on" : ""}`} />
        <svg viewBox="0 0 300 300" role="img" aria-label={`남은 시간 ${Math.ceil(remaining / 60000)}분`}>
          <circle cx={CX} cy={CY} r={DISK} className="disk" />
          {wedge(remaining)}
          {Array.from({ length: 60 }, (_, i) => {
            if (i % 5 !== 0) {
              const [x, y] = polar(100, i * 6);
              return <circle key={i} cx={x} cy={y} r="1.5" className="dot" />;
            }
            const [x1, y1] = polar(96, i * 6);
            const [x2, y2] = polar(104, i * 6);
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className="tick major" />;
          })}
          {labels.map((n) => {
            const [x, y] = polar(125, n * 6);
            return (
              <text key={n} x={x} y={y} className="num" textAnchor="middle" dominantBaseline="central">
                {n}
              </text>
            );
          })}
          <text x="170" y="26" className="arrow" textAnchor="middle" dominantBaseline="central">
            →
          </text>
          <circle cx={CX} cy={CY} r="24" className="knob" />
        </svg>
      </section>

      <div className="controls">
        <button className="sub" onClick={reset} aria-label="초기화">
          ↺
        </button>
        <button className="main" onClick={toggle}>
          {timer.running ? "일시정지" : "시작"}
        </button>
      </div>

      {flashing && (
        <div
          className="flash"
          role="alert"
          aria-label="휴식 종료"
          onAnimationEnd={() => setFlashing(false)}
          onClick={() => setFlashing(false)}
        />
      )}

      {showSettings && (
        <SettingsSheet settings={settings} onChange={applySettings} onClose={() => setShowSettings(false)} />
      )}
    </main>
  );
}

/** 입력 중에는 빈 칸을 허용하고, 입력창을 벗어날 때 1~60으로 확정한다. */
function MinutesInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft((d) => (Math.min(MAX_MINUTES, parseInt(d, 10) || 0) === value ? d : String(value)));
  }, [value]);

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={draft}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        const text = e.target.value.replace(/\D/g, "").slice(0, 3);
        setDraft(text);
        const n = parseInt(text, 10);
        if (n >= 1) onChange(Math.min(MAX_MINUTES, n));
      }}
      onBlur={() => setDraft(String(value))}
    />
  );
}

function SettingsSheet({
  settings,
  onChange,
  onClose,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  onClose: () => void;
}) {
  const num = (key: "focus" | "short" | "long", label: string) => (
    <label className="row">
      <span>{label}</span>
      <MinutesInput value={settings[key]} onChange={(v) => onChange({ ...settings, [key]: v })} />
    </label>
  );
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>설정</h2>
        {num("focus", "집중 (분, 최대 60)")}
        {num("short", "짧은 휴식 (분)")}
        {num("long", "긴 휴식 (분)")}
        <label className="row">
          <span>휴식 종료 깜빡임</span>
          <input
            type="checkbox"
            checked={settings.flash}
            onChange={(e) => onChange({ ...settings, flash: e.target.checked })}
          />
        </label>
        <div className="sheet-actions">
          <button className="sub-text" onClick={() => onChange(DEFAULT_SETTINGS)}>
            기본값으로
          </button>
          <button className="main" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
