let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

/** Short tone used as scan feedback on touch terminals. */
export function beep(kind: "ok" | "error" = "ok") {
  try {
    const audio = context();
    if (!audio) return;
    if (audio.state === "suspended") void audio.resume();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "square";
    osc.frequency.value = kind === "ok" ? 1320 : 320;
    gain.gain.value = 0.045;
    osc.connect(gain).connect(audio.destination);
    const now = audio.currentTime;
    osc.start(now);
    osc.stop(now + (kind === "ok" ? 0.07 : 0.22));
  } catch {
    /* audio is best-effort */
  }
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    navigator.vibrate(kind === "ok" ? 18 : [40, 40, 40]);
  }
}
