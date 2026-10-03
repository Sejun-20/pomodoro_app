export type Mode = "focus" | "short" | "long";

export interface Settings {
  focus: number; // 분
  short: number;
  long: number;
  longEvery: number; // N회 집중마다 긴 휴식
  autoStart: boolean;
  sound: boolean;
  vibrate: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  focus: 25,
  short: 5,
  long: 15,
  longEvery: 4,
  autoStart: false,
  sound: true,
  vibrate: true,
};

export interface TimerState {
  mode: Mode;
  running: boolean;
  endAt: number | null; // 실행 중일 때 종료 시각(ms)
  remaining: number; // 정지 중일 때 남은 시간(ms)
  cycle: number; // 현재 사이클에서 완료한 집중 횟수
}

export type DayLog = Record<string, number>; // YYYY-MM-DD -> 완료한 집중 횟수

function load<T>(key: string, fallback: T): T {
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

export const loadSettings = () => load("pomo.settings", DEFAULT_SETTINGS);
export const saveSettings = (s: Settings) => save("pomo.settings", s);
export const loadTimer = (fallback: TimerState) => load("pomo.timer", fallback);
export const saveTimer = (t: TimerState) => save("pomo.timer", t);
export const loadLog = () => load<DayLog>("pomo.log", {});
export const saveLog = (l: DayLog) => save("pomo.log", l);

export const todayKey = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
