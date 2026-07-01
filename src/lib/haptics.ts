/**
 * Tiny haptic-feedback helper. Progressive enhancement: fires a short vibration
 * on devices that support the Vibration API (Android Chrome / installed PWA),
 * and is a silent no-op everywhere else (desktop, and iOS Safari — Apple does
 * not expose `navigator.vibrate`). Safe to call from any event handler.
 */
function vibrate(pattern: number | number[]) {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* Some browsers throw outside a user gesture — ignore. */
  }
}

export const haptics = {
  /** Light tap — nav switches, button presses. */
  tap: () => vibrate(7),
  /** Selection tick — toggles like save. */
  select: () => vibrate(5),
  /** Positive confirmation — hype, send. */
  success: () => vibrate([8, 30, 12]),
};
