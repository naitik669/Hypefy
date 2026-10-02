import { describe, it, expect } from "vitest";
import { shareMetadata, withFiller, type Target } from "@/components/feed/ShareSheet";

/**
 * Who the share sheet offers, and what a share carries with it.
 *
 * The ranking itself lives in the database (share_suggestions, 0110), where
 * it was checked against real accounts. What is decided here is the rest: a
 * person you only follow is never put ahead of anyone you interact with, and
 * the photo that was on screen goes with the post.
 */

const person = (id: string, extra: Partial<Target> = {}): Target => ({
  key: `u:${id}`,
  kind: "person",
  id,
  name: id,
  username: id,
  avatar_hue: 100,
  avatar_url: null,
  ...extra,
});

describe("people you only follow", () => {
  it("are left out once there are enough people you actually interact with", () => {
    const suggested = ["a", "b", "c", "d", "e", "f"].map((id) => person(id));
    expect(withFiller(suggested, [person("stranger")]).map((t) => t.id)).not.toContain("stranger");
  });

  it("top up a thin list, after everyone you interact with, and marked as such", () => {
    const out = withFiller([person("close")], [person("follow1"), person("follow2")]);
    expect(out.map((t) => t.id)).toEqual(["close", "follow1", "follow2"]);
    expect(out[0].filler).toBeFalsy();
    expect(out[1].filler).toBe(true);
  });

  it("are never listed twice when they are also suggested", () => {
    const out = withFiller([person("a")], [person("a"), person("b")]);
    expect(out.map((t) => t.key)).toEqual(["u:a", "u:b"]);
  });

  it("keep a group in the suggestions where the ranking put it", () => {
    const group: Target = { ...person("g1"), key: "g:g1", kind: "group", members: 4 };
    const out = withFiller([person("a"), group], []);
    expect(out[1]).toMatchObject({ kind: "group", key: "g:g1" });
  });
});

describe("the photo that goes with a share", () => {
  it("is the one on screen, for a post with several photos", () => {
    expect(shareMetadata("post", 6, 2)).toEqual({ slide: 2 });
  });

  it("is left out for a single photo, or a Shot", () => {
    expect(shareMetadata("post", 1, 0)).toBeUndefined();
    expect(shareMetadata("post", 0, 0)).toBeUndefined();
    expect(shareMetadata("shot", 6, 2)).toBeUndefined();
  });

  it("stays within the photos there are", () => {
    expect(shareMetadata("post", 3, 9)).toEqual({ slide: 2 });
    expect(shareMetadata("post", 3, -4)).toEqual({ slide: 0 });
    expect(shareMetadata("post", 3, Number.NaN)).toEqual({ slide: 0 });
  });
});
