/**
 * Splitting a value across several keys, for a store with a size limit.
 *
 * Needed because of one specific limit: `expo-secure-store` warns above
 * **2048 bytes** per value and does not promise to store more.
 *
 * Measured rather than assumed, because the first version of this said "a
 * session exceeds the limit" and that is false for most of them:
 *
 *   email + password session   ~991 bytes   fits
 *   Google OAuth session      ~2424 bytes   does NOT fit
 *
 * The difference is that Supabase keeps the provider's own tokens on an
 * OAuth session — `provider_token` and `provider_refresh_token` — and
 * Google's access token alone is around 1.1KB. Hypefy has a Google sign-in
 * button, so that is not a corner case, it is every Google user. Written
 * whole it appears to work in development and then silently fails to
 * persist on a device, which reads as "the app logs me out every time I
 * close it".
 *
 * So the session is split, and the arithmetic lives here as pure functions
 * rather than inside the native binding, because here it can be tested
 * without a device. The binding in apps/mobile is three calls thick.
 *
 * The shape on disk, for a key `k`:
 *
 *   k          -> the number of parts, as a decimal string ("3")
 *   k.0, k.1,  -> the parts, in order
 *   k.2
 *
 * The count lives under the plain key so a reader needs one round trip to
 * learn whether anything is there, and so a value written by an older build
 * that did NOT chunk is still readable — see `isCount`.
 */

/**
 * The per-part ceiling, in BYTES.
 *
 * Bytes because that is the unit secure-store's own limit is in. An earlier
 * version of this counted string length, which is wrong for any value with
 * multi-byte text in it: a display name in Hindi or Japanese would measure
 * as comfortably under and still be over the real limit.
 *
 * 1500 rather than 2048 is headroom, and it is cheap: a part that fits is a
 * part that fits, and the only cost of a lower ceiling is one extra round
 * trip once a value crosses it. The margin covers what this module cannot
 * see — the platform counting the key name against the same budget, or a
 * future secure-store tightening its own figure.
 */
export const CHUNK_LIMIT = 1500;

/** The key a part is stored under. */
export function chunkKey(key: string, index: number): string {
  return `${key}.${index}`;
}

/**
 * Is this stored value a part count rather than a value?
 *
 * A short run of digits and nothing else. It matters because a build before
 * chunking stored the session JSON directly under the plain key: that starts
 * with `{`, so it fails this and is returned as-is instead of being read as
 * a count of parts that do not exist.
 */
export function isCount(raw: string | null): boolean {
  return raw !== null && /^[0-9]{1,4}$/.test(raw);
}

/** How many UTF-8 bytes a string occupies. */
export function byteLength(value: string): number {
  // TextEncoder is in every JS runtime this ships to — Hermes included —
  // and is not a DOM API.
  return new TextEncoder().encode(value).length;
}

/**
 * Split a value into parts that each fit the limit.
 *
 * Splits on BYTES, not characters, so a value of multi-byte text is cut at
 * the right place — but never inside a character, which would corrupt it on
 * reassembly. An empty value is one empty part rather than none, so that
 * "stored, and empty" stays distinguishable from "not stored".
 */
export function splitValue(value: string, limit = CHUNK_LIMIT): string[] {
  if (limit < 1) throw new Error(`chunk limit must be at least 1, got ${limit}`);
  if (byteLength(value) <= limit) return [value];

  const parts: string[] = [];
  let current = "";
  let currentBytes = 0;

  // Iterated by code POINT, not by index: a surrogate pair split across two
  // parts is two broken halves, and joining them back gives a different
  // string. `for...of` over a string yields whole code points.
  for (const ch of value) {
    const size = byteLength(ch);
    if (size > limit) {
      throw new Error(`a single character of ${size} bytes cannot fit a ${limit}-byte chunk`);
    }
    if (currentBytes + size > limit) {
      parts.push(current);
      current = "";
      currentBytes = 0;
    }
    current += ch;
    currentBytes += size;
  }
  parts.push(current);
  return parts;
}

/**
 * Put the parts back together, or null if any is missing.
 *
 * All-or-nothing on purpose. A session reassembled from three parts of four
 * is not a shorter session, it is invalid JSON — and the honest answer to a
 * half-written store is "there is nothing here", which sends the reader to
 * the sign-in screen rather than into a parse error.
 */
export function joinChunks(parts: readonly (string | null)[]): string | null {
  if (parts.length === 0) return null;
  if (parts.some((p) => p === null || p === undefined)) return null;
  return parts.join("");
}

/**
 * Every key a chunked value occupies, given the count — the plain key last.
 *
 * Order matters for removal: the parts go first and the count last, so an
 * interrupted delete leaves a count pointing at missing parts, which
 * `joinChunks` reads as nothing. The other order would leave orphaned parts
 * with no count, which nothing would ever clean up.
 */
export function keysToRemove(key: string, count: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(chunkKey(key, i));
  out.push(key);
  return out;
}
