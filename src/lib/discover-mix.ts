/**
 * Scattering Shots through Discover's posts.
 *
 * "Randomly" — but a fixed random. Each Shot's gap from the one before is
 * derived from its own id, so the same Shots against the same posts always
 * produce the same feed. A real Math.random() here would draw one grid on the
 * server and a different one in the browser, and a new one on every render,
 * so tiles would swap places under the reader for no reason at all.
 *
 * Shots keep the order they arrive in (the server ranks them); only the gaps
 * between them vary, between MIN_GAP and MAX_GAP posts, so the feed never
 * clumps two videos together and never goes too long without one.
 */

/** Deterministic PRNG, so one seed gives one order. */
function rng(seed: number) {
  let t = seed + 0x6d2b79f5;
  return () => {
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Turns the feed over without throwing the ranking away.
 *
 * Discover's order is a pure function of the pool, so asking the server again
 * returns the same posts in the same order — which is why Refresh appeared to
 * do nothing at all. This shuffles within bands of `band` posts: the best
 * still come first, but not in the order you just scrolled past. Seed 0 is
 * the ranking untouched, so a first load is never shuffled.
 */
export function reshuffle<T>(list: T[], seed: number, band = 12): T[] {
  if (!seed) return list;
  const next = [...list];
  const rand = rng(seed);
  for (let start = 0; start < next.length; start += band) {
    const end = Math.min(start + band, next.length);
    for (let i = end - 1; i > start; i--) {
      const j = start + Math.floor(rand() * (i - start + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
  }
  return next;
}

export type Mixed<P, S> = { kind: "post"; item: P } | { kind: "shot"; item: S };

const MIN_GAP = 3;
const MAX_GAP = 7;

/** FNV-1a — small, fast, and stable across runtimes. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function gapFor(id: string): number {
  return MIN_GAP + (hash(id) % (MAX_GAP - MIN_GAP + 1));
}

export function mixShots<P, S extends { id: string }>(
  posts: readonly P[],
  shots: readonly S[]
): Mixed<P, S>[] {
  const out: Mixed<P, S>[] = [];
  let s = 0;
  // The first Shot comes a little earlier than the rest, so a video is on
  // the first screen rather than two scrolls down.
  let untilNext = shots.length ? Math.max(1, gapFor(shots[0].id) - 2) : Infinity;

  for (const post of posts) {
    out.push({ kind: "post", item: post });
    untilNext -= 1;
    if (untilNext <= 0 && s < shots.length) {
      out.push({ kind: "shot", item: shots[s] });
      s += 1;
      untilNext = s < shots.length ? gapFor(shots[s].id) : Infinity;
    }
  }

  // More Shots than the posts could space out: the rest go at the end rather
  // than being dropped. Posts loaded later are appended after these, so they
  // still never move.
  while (s < shots.length) {
    out.push({ kind: "shot", item: shots[s] });
    s += 1;
  }
  return out;
}
