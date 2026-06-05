// Lightweight WebAudio ringtone — no asset needed. Plays a looping two-tone
// ring for outgoing (ringback) and incoming calls. Falls back gracefully if
// the browser blocks audio (e.g. no prior user gesture) and adds vibration
// on mobile for incoming calls.

let ctx: AudioContext | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

function ringOnce() {
  if (!ctx) return;
  const now = ctx.currentTime;
  // Classic two-tone ringback (440 + 480 Hz), ~1s burst.
  for (const f of [440, 480]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = f;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.05);
    gain.gain.setValueAtTime(0.12, now + 0.9);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.0);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 1.05);
  }
}

export function startRing(kind: "incoming" | "outgoing") {
  stopRing();
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    ringOnce();
    // Cadence: incoming rings a bit more urgently than outgoing ringback.
    timer = setInterval(ringOnce, kind === "incoming" ? 2600 : 3600);
    if (kind === "incoming" && typeof navigator !== "undefined" && "vibrate" in navigator) {
      try { navigator.vibrate?.([500, 250, 500, 250]); } catch {}
    }
  } catch {
    /* audio blocked — silent fallback */
  }
}

export function stopRing() {
  if (timer) { clearInterval(timer); timer = null; }
  if (ctx) { ctx.close().catch(() => {}); ctx = null; }
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try { navigator.vibrate?.(0); } catch {}
  }
}
