/**
 * How far along an upload is, measured in bytes rather than in items.
 *
 * Two things were wrong with what this replaces.
 *
 * The multi-file arithmetic counted items: `10 + ((i + 1) / n) * 72`. Four
 * photos of 200 KB, 200 KB, 200 KB and 9 MB reported three quarters done
 * with nine tenths of the bytes still to send, and then sat there. Weighting
 * by size costs one reduce and the sizes are known before anything is sent.
 *
 * And the creep between milestones ran to 90% whatever was actually
 * happening, so a bar at 88% might have one byte or eight megabytes left.
 * It still creeps — the platform gives no progress events for a
 * storage.upload() call, so something has to move — but now it may only
 * creep as far as the NEXT real milestone, which means the distance it
 * covers on its own is bounded by the size of the file in flight rather
 * than by a constant.
 *
 * None of this is in-flight byte progress. Getting that means abandoning
 * storage.upload() for a signed upload URL driven by XMLHttpRequest, whose
 * `upload.onprogress` is the only progress event the platform offers for a
 * request body. That is the right end state and it is a rewrite of the one
 * path every user touches, so it wants a real device test rather than a
 * confident diff.
 */

/** Everything before the first byte goes up: hashing, posters, downscaling. */
export const PREPARE_PCT = 8;

/** The share of the bar the uploads themselves own. */
export const STORE_PCT = 84;

/**
 * Where the bar starts.
 *
 * Not zero. A bar that sits at zero while a 9 MB photo is being hashed and
 * downscaled reads as "nothing is happening", and something is.
 */
export const START_PCT = 6;

const clean = (n: unknown): number =>
  typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0;

/**
 * Whether these sizes can be weighted at all.
 *
 * A File always reports a size, but a resumed upload read back from
 * IndexedDB, or a Blob built by a canvas, can report 0 — and dividing by a
 * total of nought is how a progress bar becomes NaN%.
 */
export function measurable(sizes: readonly number[]): boolean {
  return sizes.length > 0 && sizes.some((s) => clean(s) > 0);
}

/**
 * The percentage once `done` of these files have been stored.
 *
 * Weighted by bytes, so the bar moves in proportion to the work rather than
 * to the number of things. Falls back to even weighting when the sizes are
 * not usable, which is the old behaviour and still better than NaN.
 */
export function storedPercent(sizes: readonly number[], done: number): number {
  const n = sizes.length;
  if (n <= 0) return PREPARE_PCT;
  const stored = Math.max(0, Math.min(done, n));

  if (!measurable(sizes)) {
    return PREPARE_PCT + (STORE_PCT * stored) / n;
  }

  const total = sizes.reduce((sum, s) => sum + clean(s), 0);
  const sent = sizes.slice(0, stored).reduce((sum, s) => sum + clean(s), 0);
  return PREPARE_PCT + (STORE_PCT * sent) / total;
}

/**
 * How far the creep may go while file `done` is in flight.
 *
 * Just short of where finishing that file will actually put the bar, so the
 * creep can never claim progress a real milestone has not reached. Shy of it
 * by a hair, because arriving exactly at the next milestone and then jumping
 * to the same number is a bar that stalls visibly at the worst moment.
 */
export function creepCeiling(sizes: readonly number[], done: number): number {
  const next = storedPercent(sizes, done + 1);
  const here = storedPercent(sizes, done);
  // Nine tenths of the way to the next milestone. On a single large file
  // that is most of the bar; on the last of twenty small ones it is a
  // fraction of a percent, which is correct — there is very little left.
  return here + (next - here) * 0.9;
}

/** What somebody is told while it happens. */
export function uploadLabel(kind: "post" | "shot", scheduled = false): string {
  if (kind === "shot") return scheduled ? "Scheduling your Shot…" : "Posting your Shot…";
  return scheduled ? "Scheduling your post…" : "Sharing your post…";
}
