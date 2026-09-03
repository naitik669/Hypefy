import { describe, it, expect } from "vitest";
import { sanitizeInterests, INTERESTS } from "@/lib/profile";

/**
 * Interests reach the feed ranker, so this is the boundary where a client
 * string turns into a ranking input. Everything here is about what must NOT
 * get through.
 */
describe("sanitizeInterests", () => {
  it("keeps known interests", () => {
    expect(sanitizeInterests(["Music", "Gaming"])).toEqual(["Music", "Gaming"]);
  });

  it("drops unknown values rather than rejecting the whole edit", () => {
    // A stale client sending a retired interest should still save the rest.
    expect(sanitizeInterests(["Music", "Cryptocurrency", "Gaming"])).toEqual([
      "Music",
      "Gaming",
    ]);
  });

  it("dedupes", () => {
    expect(sanitizeInterests(["Music", "Music", "Music"])).toEqual(["Music"]);
  });

  it("caps at the size of the catalogue", () => {
    const flooded = Array.from({ length: 500 }, (_, i) => INTERESTS[i % INTERESTS.length]);
    expect(sanitizeInterests(flooded)).toHaveLength(INTERESTS.length);
  });

  it("survives junk without throwing", () => {
    expect(sanitizeInterests(null)).toEqual([]);
    expect(sanitizeInterests(undefined)).toEqual([]);
    expect(sanitizeInterests("Music")).toEqual([]);
    expect(sanitizeInterests({ Music: true })).toEqual([]);
    expect(sanitizeInterests([1, null, undefined, {}, []])).toEqual([]);
  });

  it("is case-sensitive against the catalogue", () => {
    // Ranking lowercases separately; storing a variant would create a second
    // value meaning the same thing that no picker can ever unset.
    expect(sanitizeInterests(["music"])).toEqual([]);
  });
});
