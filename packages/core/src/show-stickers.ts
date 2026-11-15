/**
 * The arithmetic behind the stickers that do something — kept pure and
 * apart from the components so it can be tested without a browser.
 */

/** What the viewer knows about the interactive stickers on one Show (show_sticker_state). */
export type StickerState = {
  /** Hype sliders, by layer id: the average 0–100, how many slid, and yours. */
  sliders: Record<string, { avg: number; count: number; mine: number | null }>;
  /** Countdowns you asked to be reminded of, by layer id. */
  reminders: string[];
  /** How many Shows have been added to each Add yours prompt, by layer id. */
  added: Record<string, number>;
};

export const EMPTY_STICKER_STATE: StickerState = { sliders: {}, reminders: [], added: {} };

/** A server answer read defensively: anything missing reads as nothing yet. */
export function readStickerState(raw: unknown): StickerState {
  if (!raw || typeof raw !== "object") return EMPTY_STICKER_STATE;
  const r = raw as Record<string, unknown>;
  const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
  const sliders: StickerState["sliders"] = {};
  for (const [id, v] of Object.entries(obj(r.sliders))) {
    const s = obj(v);
    sliders[id] = {
      avg: Number(s.avg) || 0,
      count: Number(s.count) || 0,
      mine: typeof s.mine === "number" ? s.mine : null,
    };
  }
  const added: StickerState["added"] = {};
  for (const [id, v] of Object.entries(obj(r.added))) added[id] = Number(v) || 0;
  return {
    sliders,
    reminders: Array.isArray(r.reminders) ? r.reminders.filter((x): x is string => typeof x === "string") : [],
    added,
  };
}

/** Days, hours and minutes left, or ended. */
export function countdownParts(at: string, now = Date.now()): { days: number; hours: number; minutes: number; ended: boolean } {
  const ms = Date.parse(at) - now;
  if (!Number.isFinite(ms) || ms <= 0) return { days: 0, hours: 0, minutes: 0, ended: true };
  const minutes = Math.floor(ms / 60_000);
  return { days: Math.floor(minutes / 1440), hours: Math.floor((minutes % 1440) / 60), minutes: minutes % 60, ended: false };
}

/** For a quiz option once you have answered: right, your wrong pick, or neither. */
export function quizMark(option: number, answer: number, mine: number | null): "right" | "wrong" | null {
  if (mine === null) return null;
  if (option === answer) return "right";
  if (option === mine) return "wrong";
  return null;
}

/**
 * Whether the counts on a poll or a quiz should be showing.
 *
 * It used to be `mine !== null` alone, which answered the wrong question. A
 * viewer earns the counts by answering, and that is the point — but the
 * author is not a viewer. Their own poll was hiding its results from them
 * until they voted in it, which is the one thing they should not be doing.
 */
export function revealed(isAuthor: boolean, mine: number | null): boolean {
  return isAuthor || mine !== null;
}

/**
 * What a live sticker should hold when the server's answer arrives after it
 * has already mounted.
 *
 * The thread fetches poll tallies and sticker state once, a moment after the
 * Show is on screen, and every sticker mounts before that lands. Until now the
 * only route in was a remount: `LayerStack` keyed each layer on a version
 * string, so the arriving state threw every sticker away and built it again.
 * That is also why a half-typed answer or a dragged slider vanished.
 *
 * So the seed comes in as a prop instead, and this decides what to do with it:
 * adopt it while the person has not touched the control, and once they have,
 * remember the seed arrived but leave their own value alone. Their vote is
 * newer than the server's idea of it.
 *
 * Returns the same object when nothing changed, because the caller adjusts
 * state with it during render — a fresh object every time is a render loop.
 */
export type Seeded<T> = { value: T; seed: T };

export function seeded<T>(held: Seeded<T>, seed: T, touched: boolean): Seeded<T> {
  if (seed === held.seed) return held;
  return touched ? { value: held.value, seed } : { value: seed, seed };
}

/**
 * What to tell someone whose tap did not reach the server.
 *
 * Both the slider and the question used to do `if (error) return;` — the
 * slider left the star wherever it was dragged, recording nothing and saying
 * nothing, which is worse than refusing outright.
 *
 * `rate_limit()` raises a check violation, so that code is the one answer
 * worth wording differently: it means try again shortly, not something broke.
 */
export function stickerError(error: unknown): string | null {
  if (!error) return null;
  const code = (error as { code?: unknown }).code;
  if (code === "23514") return "Slow down a moment";
  return "Couldn't save that";
}

/**
 * The colour for an icon drawn on a button filled with `ink`.
 *
 * A look's box background can be a gradient now, which is not a colour an
 * SVG stroke can take — so the icon's colour comes from the ink instead.
 */
export function onInk(ink: string): string {
  return /^#(?:0a0a0a|000000|111111)$/i.test(ink) ? "#ffffff" : "#0a0a0a";
}
