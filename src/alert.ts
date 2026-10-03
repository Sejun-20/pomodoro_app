let ctx: AudioContext | null = null;

/** iOS는 사용자 제스처 안에서 AudioContext를 깨워야 소리가 난다. */
export function unlockAudio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    /* 미지원 */
  }
}

export function beep() {
  const c = ctx;
  if (!c) return;
  const now = c.currentTime;
  [0, 0.25, 0.5].forEach((offset) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.4, now + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.2);
    osc.connect(gain).connect(c.destination);
    osc.start(now + offset);
    osc.stop(now + offset + 0.22);
  });
}

export function vibrate() {
  navigator.vibrate?.([200, 100, 200, 100, 200]);
}
