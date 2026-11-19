import type { Json } from "./supabase/database.types";
import { hypeResult } from "./supabase/typed";

/**
 * Hyping, as the three state changes it actually is.
 *
 * Pure, and shared, because this is the first WRITE either client makes to
 * the same row and the failure modes are the kind nobody notices:
 *
 *  - The optimistic step must not let a count go negative. The server
 *    cannot produce -1, so a -1 on screen is always the client's own
 *    arithmetic running on a stale count.
 *  - The server's answer wins. `toggle_hype` returns the true state, and a
 *    client that keeps its own guess after a round trip will disagree with
 *    the next refresh for no visible reason.
 *  - A failure restores what was there BEFORE the optimistic step, not
 *    "the opposite of now" — those differ the moment two taps overlap.
 *
 * The web had this inline in FeedCard and the phone needed the same three
 * rules, so they are here and both call them. The effects around it —
 * haptics, particles, the toast — stay in each client, because those are
 * platform and not logic.
 */

export type HypeState = {
  readonly hyped: boolean;
  readonly count: number;
};

/**
 * What to show immediately, before the server has answered.
 *
 * Floored at zero: a count can arrive stale (it is a denormalised column
 * the feed read seconds ago), and un-hyping from a stale 0 would show -1.
 */
export function optimistic(state: HypeState): HypeState {
  return state.hyped
    ? { hyped: false, count: Math.max(0, state.count - 1) }
    : { hyped: true, count: state.count + 1 };
}

/**
 * What to show once `toggle_hype` has answered.
 *
 * `raw` is the RPC's jsonb. When it cannot be read — an older function, a
 * shape change — the optimistic state stands rather than snapping back:
 * the write did succeed, so the one thing that would be wrong is to show
 * it as not having happened.
 */
export function settle(optimisticState: HypeState, raw: Json | null | undefined): HypeState {
  const result = hypeResult(raw);
  if (!result || !Number.isFinite(result.hype_count)) return optimisticState;
  return { hyped: result.hyped, count: Math.max(0, result.hype_count) };
}

/**
 * Double-tap: hypes, and never un-hypes.
 *
 * The web's own rule. A double-tap is a gesture of enthusiasm, and reading
 * the second tap as "take it back" makes an affectionate gesture
 * destructive. Already hyped means the animation replays and nothing is
 * written, which is what `write: false` says — both paths animate, so only
 * the write is worth returning.
 */
export function doubleTap(state: HypeState): { next: HypeState; write: boolean } {
  if (state.hyped) return { next: state, write: false };
  return { next: optimistic(state), write: true };
}
