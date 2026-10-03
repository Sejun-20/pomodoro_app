import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_SETTINGS,
  loadLog,
  loadSettings,
  loadTimer,
  saveLog,
  saveSettings,
  saveTimer,
  todayKey,
  type Mode,
  type Settings,
  type TimerState,
} from "./storage";
import { beep, unlockAudio, vibrate } from "./alert";

const LABEL: Record<Mode, string> = { focus: "집중", short: "짧은 휴식", long: "긴 휴식" };
const minutes = (s: Settings, m: Mode) => s[m] * 60_000;

function format(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [timer, setTimer] = useState<TimerState>(() =>
    loadTimer({ mode: "focus", running: false, endAt: null, remaining: minutes(loadSettings(), "focus"), cycle: 0 }),
  );
  const [now, setNow] = useState(Date.now());
  const [log, setLog] = useState(loadLog);
  const [showSettings, setShowSettings] = useState(false);
  const wakeLock = useRef<WakeLockSentinel | null>(null);

  const remaining = timer.running && timer.endAt ? timer.endAt - now : timer.remaining;
  const total = minutes(settings, timer.mode);
  const progress = Math.min(1, Math.max(0, 1 - remaining / total));

  useEffect(() => saveTimer(timer), [timer]);
  useEffect(() => saveSettings(settings), [settings]);

  // 종료 시각 기준으로 계산하므로 백그라운드에 다녀와도 정확하다.
  useEffect(() => {
    if (!timer.running) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [timer.running]);

  const switchTo = useCallback(
    (mode: Mode, cycle: number, run: boolean): TimerState => {
      const ms = minutes(settings, mode);
      return { mode, cycle, running: run, endAt: run ? Date.now() + ms : null, remaining: ms };
    },
    [settings],
  );

  const afterFocus = useCallback(
    (run: boolean) => {
      const cycle = timer.cycle + 1;
      return cycle >= settings.longEvery ? switchTo("long", 0, run) : switchTo("short", cycle, run);
    },
    [timer.cycle, settings.longEvery, switchTo],
  );

  // 종료 처리
  useEffect(() => {
    if (!timer.running || remaining > 0) return;
    if (settings.sound) beep();
    if (settings.vibrate) vibrate();
    if (timer.mode === "focus") {
      const key = todayKey();
      const stored = loadLog();
      const next = { ...stored, [key]: (stored[key] ?? 0) + 1 };
      saveLog(next);
      setLog(next);
      setTimer(afterFocus(settings.autoStart));
    } else {
      setTimer(switchTo("focus", timer.cycle, settings.autoStart));
    }
  }, [remaining, timer, settings, switchTo, afterFocus]);

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

  useEffect(() => {
    document.title = timer.running ? `${format(remaining)} · ${LABEL[timer.mode]}` : "뽀모도로 타이머";
  }, [remaining, timer.running, timer.mode]);

  const toggle = () => {
    unlockAudio();
    setNow(Date.now());
    setTimer((t) =>
      t.running
        ? { ...t, running: false, endAt: null, remaining: Math.max(0, (t.endAt ?? Date.now()) - Date.now()) }
        : { ...t, running: true, endAt: Date.now() + t.remaining },
    );
  };
  const reset = () => setTimer(switchTo(timer.mode, timer.cycle, false));
  const skip = () => setTimer(timer.mode === "focus" ? afterFocus(false) : switchTo("focus", timer.cycle, false));
  const pick = (m: Mode) => setTimer(switchTo(m, timer.cycle, false));

  const applySettings = (s: Settings) => {
    setSettings(s);
    // 정지 상태면 새 시간 설정을 바로 반영
    setTimer((t) => (t.running ? t : { ...t, remaining: s[t.mode] * 60_000 }));
  };

  const R = 130;
  const C = 2 * Math.PI * R;
  const today = log[todayKey()] ?? 0;

  return (
    <main className={`app ${timer.mode}`}>
      <header>
        <h1>🍅 뽀모도로</h1>
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

      <section className="dial">
        <svg viewBox="0 0 300 300">
          <circle cx="150" cy="150" r={R} className="track" />
          <circle
            cx="150"
            cy="150"
            r={R}
            className="bar"
            strokeDasharray={C}
            strokeDashoffset={C * progress}
            transform="rotate(-90 150 150)"
          />
        </svg>
        <div className="time">
          <strong>{format(remaining)}</strong>
          <span>{LABEL[timer.mode]}</span>
        </div>
      </section>

      <div className="dots" aria-label={`이번 사이클 ${timer.cycle}/${settings.longEvery}`}>
        {Array.from({ length: settings.longEvery }, (_, i) => (
          <i key={i} className={i < timer.cycle ? "on" : ""} />
        ))}
      </div>

      <div className="controls">
        <button className="sub" onClick={reset} aria-label="초기화">
          ↺
        </button>
        <button className="main" onClick={toggle}>
          {timer.running ? "일시정지" : "시작"}
        </button>
        <button className="sub" onClick={skip} aria-label="건너뛰기">
          ⏭
        </button>
      </div>

      <p className="today">
        오늘 완료한 집중 <b>{today}</b>회 · {today * settings.focus}분
      </p>

      {showSettings && (
        <SettingsSheet settings={settings} onChange={applySettings} onClose={() => setShowSettings(false)} />
      )}
    </main>
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
  const num = (key: "focus" | "short" | "long" | "longEvery", label: string, max: number) => (
    <label className="row">
      <span>{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={max}
        value={settings[key]}
        onChange={(e) => {
          const v = Math.min(max, Math.max(1, Math.floor(Number(e.target.value)) || 1));
          onChange({ ...settings, [key]: v });
        }}
      />
    </label>
  );
  const check = (key: "autoStart" | "sound" | "vibrate", label: string) => (
    <label className="row">
      <span>{label}</span>
      <input type="checkbox" checked={settings[key]} onChange={(e) => onChange({ ...settings, [key]: e.target.checked })} />
    </label>
  );
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>설정</h2>
        {num("focus", "집중 (분)", 180)}
        {num("short", "짧은 휴식 (분)", 60)}
        {num("long", "긴 휴식 (분)", 120)}
        {num("longEvery", "긴 휴식까지 집중 횟수", 12)}
        {check("autoStart", "다음 단계 자동 시작")}
        {check("sound", "종료 알림음")}
        {check("vibrate", "종료 진동 (안드로이드)")}
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
