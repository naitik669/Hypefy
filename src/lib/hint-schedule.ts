/**
 * When a hint may be shown.
 *
 * A screen has a handful of things worth pointing out: what a button does,
 * and the gestures nothing on screen gives away. Shown one after another
 * they are a tutorial to be clicked through, and shown on every visit they
 * are a nag. So:
 *
 *   - the first one comes on the first visit;
 *   - after that, one more only now and then: some days later AND some
 *     visits later, whichever takes longer;
 *   - each is shown once, ever. When they are used up there are no more.
 *
 * Kept on the device. It is a courtesy, not a record.
 */

export type HintState = {
  /** Ids already shown. */
  seen: string[];
  /** When the last one was shown (ms), or null if none has been. */
  lastAt: number | null;
  /** Visits to the screen since the last one was shown. */
  visits: number;
};

export const NO_HINTS_YET: HintState = { seen: [], lastAt: null, visits: 0 };

/** At least this long between two hints. */
export const HINT_GAP_MS = 2 * 24 * 60 * 60 * 1000;
/** And at least this many visits to the screen in between. */
export const HINT_GAP_VISITS = 4;

const KEY = (screen: string) => `hypefy_hints_${screen}`;
const OLD_FLAG = (id: string) => `hypefy_hint_${id}`;

export function readHintState(screen: string, knownIds: string[] = []): HintState {
  try {
    const raw = localStorage.getItem(KEY(screen));
    const parsed = raw ? (JSON.parse(raw) as Partial<HintState>) : null;
    const seen = new Set(Array.isArray(parsed?.seen) ? parsed!.seen.filter((x) => typeof x === "string") : []);
    // Tips read under the old one-flag-each scheme count as read.
    for (const id of knownIds) if (localStorage.getItem(OLD_FLAG(id)) === "1") seen.add(id);
    return {
      seen: [...seen],
      lastAt: typeof parsed?.lastAt === "number" ? parsed.lastAt : null,
      visits: typeof parsed?.visits === "number" && parsed.visits > 0 ? Math.floor(parsed.visits) : 0,
    };
  } catch {
    // Private mode: behave as though everything has been read, so nothing nags.
    return { seen: knownIds, lastAt: Date.now(), visits: 0 };
  }
}

export function writeHintState(screen: string, state: HintState) {
  try {
    localStorage.setItem(KEY(screen), JSON.stringify(state));
  } catch {
    /* nothing to do */
  }
}

/** One more visit to the screen. */
export function withVisit(state: HintState): HintState {
  return { ...state, visits: state.visits + 1 };
}

/** A hint was shown: it is used up, and the wait starts again. */
export function withShown(state: HintState, id: string, now: number): HintState {
  return { seen: state.seen.includes(id) ? state.seen : [...state.seen, id], lastAt: now, visits: 0 };
}

/** Is it time for another one? */
export function hintDue(state: HintState, now: number): boolean {
  if (state.lastAt === null && state.seen.length === 0) return true;
  if (state.lastAt === null) return state.visits >= HINT_GAP_VISITS;
  return now - state.lastAt >= HINT_GAP_MS && state.visits >= HINT_GAP_VISITS;
}

/**
 * Which hint to show now, or null for none. `pool` is in the order they
 * should come; `available` says whether a hint's control is on the screen
 * (one that is not is passed over, and kept for another time).
 */
export function nextHint(
  pool: string[],
  state: HintState,
  now: number,
  available: (id: string) => boolean,
): string | null {
  if (!hintDue(state, now)) return null;
  return pool.find((id) => !state.seen.includes(id) && available(id)) ?? null;
}
