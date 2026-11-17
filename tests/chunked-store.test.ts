import { describe, it, expect } from "vitest";
import {
  CHUNK_LIMIT,
  byteLength,
  chunkKey,
  isCount,
  joinChunks,
  keysToRemove,
  splitValue,
} from "@hypefy/core/chunked-store";

/**
 * Splitting a value across keys, for expo-secure-store's size limit.
 *
 * The limit is the reason this exists: secure-store warns above 2048 bytes
 * per value and does not promise to keep more. A Supabase session is JSON
 * holding two JWTs, the user row and an expiry, which goes over. Written
 * whole it appears fine in development and silently fails to persist on a
 * device — which presents as "the app logs me out every time I close it".
 *
 * Tested here rather than on a device because the arithmetic is pure. The
 * native binding is three calls thick and has nothing in it to get wrong.
 */

describe("splitting", () => {
  it("leaves a small value alone, as one part", () => {
    expect(splitValue("hello")).toEqual(["hello"]);
  });

  it("keeps an empty value as one empty part", () => {
    // Not zero parts: "stored, and empty" has to stay distinguishable from
    // "not stored", and a count of 0 would read as the latter.
    expect(splitValue("")).toEqual([""]);
  });

  it("splits a long value into parts that each fit", () => {
    const value = "x".repeat(CHUNK_LIMIT * 2 + 7);
    const parts = splitValue(value);
    expect(parts.length).toBe(3);
    for (const p of parts) expect(byteLength(p)).toBeLessThanOrEqual(CHUNK_LIMIT);
  });

  it("and the parts put back together are the original", () => {
    const value = "x".repeat(CHUNK_LIMIT * 3 + 1);
    expect(joinChunks(splitValue(value))).toBe(value);
  });

  it("splits exactly at the limit without an empty trailing part", () => {
    const value = "x".repeat(CHUNK_LIMIT);
    expect(splitValue(value)).toEqual([value]);
    expect(splitValue(value).length).toBe(1);
  });

  it("one byte over the limit is two parts", () => {
    const parts = splitValue("x".repeat(CHUNK_LIMIT + 1));
    expect(parts.length).toBe(2);
    expect(parts[1]).toBe("x");
  });

  /**
   * The one that matters and the reason this counts bytes.
   *
   * The limit is in bytes; a naive `slice(0, limit)` counts UTF-16 units, so
   * a value of multi-byte text would be cut at the wrong place — and worse,
   * cut THROUGH a character, so rejoining gives a different string back.
   */
  it("measures in bytes, not characters", () => {
    // Three bytes each, so a third as many fit.
    const value = "あ".repeat(800);
    expect(byteLength("あ")).toBe(3);
    const parts = splitValue(value);
    for (const p of parts) expect(byteLength(p)).toBeLessThanOrEqual(CHUNK_LIMIT);
    expect(joinChunks(parts)).toBe(value);
    // 800 × 3 = 2400 bytes over a 1500 limit: two parts, not one.
    expect(parts.length).toBe(2);
  });

  it("never cuts through a character", () => {
    // A surrogate pair split across two parts is two broken halves, and
    // joining them gives a different string. Emoji are four bytes and two
    // UTF-16 units, which is exactly the case a naive slice gets wrong.
    const value = "🙂".repeat(500);
    const parts = splitValue(value);
    expect(joinChunks(parts)).toBe(value);
    for (const p of parts) {
      // A lone surrogate survives a round trip through JSON as U+FFFD, so
      // this is the check that each part is whole text on its own.
      expect(JSON.parse(JSON.stringify(p))).toBe(p);
      // A HIGH surrogate with no low after it, or a LOW with no high before.
      //
      // My first attempt was /[\uD800-\uDFFF](?![\uDC00-\uDFFF])/, which is
      // wrong in a way that looked right: that range covers low surrogates
      // too, so the second half of every VALID pair matched it and the test
      // failed on correct output. The two halves need separate clauses.
      expect(p).not.toMatch(
        /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/,
      );
    }
  });

  it("refuses a limit no character could fit", () => {
    // Better to throw at the boundary than to loop forever or write parts
    // that can never be read back.
    expect(() => splitValue("あ", 2)).toThrow(/cannot fit/);
  });

  it("refuses a nonsense limit", () => {
    expect(() => splitValue("x", 0)).toThrow(/at least 1/);
  });
});

describe("joining", () => {
  it("returns null when a part is missing", () => {
    // All-or-nothing. A session rebuilt from three parts of four is not a
    // shorter session, it is invalid JSON — and "there is nothing here"
    // sends the reader to sign-in instead of into a parse error.
    expect(joinChunks(["a", null, "c"])).toBe(null);
  });

  it("returns null for no parts at all", () => {
    expect(joinChunks([])).toBe(null);
  });

  it("joins empty parts into an empty value rather than null", () => {
    expect(joinChunks([""])).toBe("");
  });
});

describe("the count under the plain key", () => {
  it("reads a count as a count", () => {
    expect(isCount("3")).toBe(true);
    expect(isCount("12")).toBe(true);
  });

  it("does not read a session written by an older build as a count", () => {
    // The migration case. Before chunking, the session JSON went straight
    // under the plain key. It starts with `{`, so it must fail this and be
    // returned as-is rather than read as a count of parts that do not exist
    // — otherwise everyone is signed out by the update.
    expect(isCount('{"access_token":"ey..."}')).toBe(false);
  });

  it("nor an absent value, nor something merely containing digits", () => {
    expect(isCount(null)).toBe(false);
    expect(isCount("")).toBe(false);
    expect(isCount("3 parts")).toBe(false);
    expect(isCount("v3")).toBe(false);
    // A JWT is long and starts with letters; a bare number it is not.
    expect(isCount("eyJhbGciOiJIUzI1NiJ9")).toBe(false);
  });

  it("and not an implausibly huge one", () => {
    // Four digits is 9,999 parts, which at this limit is ~15MB. Past that
    // it is far likelier to be data than a count.
    expect(isCount("99999")).toBe(false);
  });
});

describe("the keys", () => {
  it("are the plain key plus an index", () => {
    expect(chunkKey("sb-session", 0)).toBe("sb-session.0");
    expect(chunkKey("sb-session", 11)).toBe("sb-session.11");
  });

  it("are removed parts-first, count last", () => {
    // An interrupted delete must leave a count pointing at missing parts,
    // which joinChunks reads as nothing. The other order leaves orphaned
    // parts with no count, which nothing would ever clean up.
    expect(keysToRemove("k", 3)).toEqual(["k.0", "k.1", "k.2", "k"]);
  });

  it("and a single-part value still clears both", () => {
    expect(keysToRemove("k", 1)).toEqual(["k.0", "k"]);
  });
});

/**
 * A real session, end to end — and which kind actually needs splitting.
 *
 * I wrote these asserting that "a session exceeds the limit" and they
 * failed, which was the useful outcome: a plain email-and-password session
 * is about 991 bytes and fits inside secure-store's 2048 comfortably.
 *
 * What does not fit is an OAUTH session. Supabase keeps the provider's own
 * tokens on it — `provider_token` and `provider_refresh_token` — and
 * Google's access token alone is around 1.1KB, taking the stored object to
 * roughly 2.4KB. Hypefy has a Google sign-in button, so that is not a corner
 * case, it is every Google user.
 *
 * So both are asserted: the common session must NOT be split, because
 * splitting costs extra round trips on every read, and the OAuth one MUST
 * be, because otherwise it silently fails to persist and the app logs that
 * user out on every launch.
 */
describe("a real session, end to end", () => {
  const JWT = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${"a".repeat(700)}.${"b".repeat(43)}`;

  /** Email and password: two JWTs and a small user row. */
  function passwordSession(): string {
    return JSON.stringify({
      access_token: JWT,
      refresh_token: "v1.".concat("c".repeat(40)),
      expires_at: 1794860066,
      token_type: "bearer",
      user: { id: "00000000-0000-0000-0000-000000000000", email: "someone@example.com" },
    });
  }

  /** Google: the same, plus the provider's own tokens and a photo URL. */
  function oauthSession(): string {
    return JSON.stringify({
      access_token: JWT,
      refresh_token: "v1.".concat("c".repeat(40)),
      provider_token: "ya29.".concat("d".repeat(1100)),
      provider_refresh_token: "1//0g".concat("e".repeat(100)),
      expires_at: 1794860066,
      token_type: "bearer",
      user: {
        id: "00000000-0000-0000-0000-000000000000",
        email: "someone@example.com",
        user_metadata: {
          display_name: "Someone",
          avatar_url: "https://lh3.googleusercontent.com/a/".concat("f".repeat(80)),
        },
      },
    });
  }

  it("a password session fits, and is left as one part", () => {
    // Splitting costs a round trip per part on every read. Not splitting
    // what fits is the point of measuring rather than always chunking.
    expect(byteLength(passwordSession())).toBeLessThan(2048);
    expect(splitValue(passwordSession())).toHaveLength(1);
  });

  it("a Google session does not fit secure-store, and is split", () => {
    // 2048 is the documented ceiling. If this ever stops being true the
    // chunking is dead weight, so it is asserted rather than assumed.
    expect(byteLength(oauthSession())).toBeGreaterThan(2048);
    expect(splitValue(oauthSession()).length).toBeGreaterThan(1);
  });

  it("and survives the round trip, still parsing as the session", () => {
    const value = oauthSession();
    const back = joinChunks(splitValue(value));
    expect(back).toBe(value);
    // Not merely the same bytes: still the session it was.
    expect(JSON.parse(back!).user.email).toBe("someone@example.com");
    expect(JSON.parse(back!).provider_token).toMatch(/^ya29\./);
  });

  it("losing one part gives nothing rather than half a session", () => {
    const parts: (string | null)[] = splitValue(oauthSession());
    parts[parts.length - 1] = null;
    expect(joinChunks(parts)).toBe(null);
  });
});
