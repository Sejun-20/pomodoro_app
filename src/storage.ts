export type Mode = "focus" | "short" | "long";

export interface Settings {
  focus: number; // 분 (다이얼이 60분 기준이라 최대 60)
  short: number;
  long: number;
  vibrate: boolean; // 휴식 종료 시 진동
}

export const MAX_MINUTES = 60;

export const DEFAULT_SETTINGS: Settings = {
  focus: 25,
  short: 5,
  long: 15,
  vibrate: true,
};

export interface TimerState {
  mode: Mode;
  running: boolean;
  endAt: number | null; // 실행 중일 때 종료 시각(ms)
  remaining: number; // 정지 중일 때 남은 시간(ms)
}

function load<T extends object>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 저장 실패는 무시 */
  }
}

export function loadSettings(): Settings {
  const s = load("pomo.settings", DEFAULT_SETTINGS);
  const clamp = (n: number) => Math.min(MAX_MINUTES, Math.max(1, Number(n) || 1));
  return { focus: clamp(s.focus), short: clamp(s.short), long: clamp(s.long), vibrate: !!s.vibrate };
}
export const saveSettings = (s: Settings) => save("pomo.settings", s);
export const loadTimer = (fallback: TimerState): TimerState => {
  const t = load("pomo.timer", fallback);
  return { mode: t.mode, running: t.running, endAt: t.endAt, remaining: t.remaining };
};
export const saveTimer = (t: TimerState) => save("pomo.timer", t);
