import { describe, it, expect } from "vitest";
import { MAX_RUN, mixShots, mixShotsSplit, gapFor } from "@/lib/discover-mix";

const posts = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);
const shots = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `shot-${i}-${(i * 7919).toString(36)}` }));

describe("mixShots", () => {
  it("keeps every post and every shot, each once", () => {
    const out = mixShots(posts(60), shots(10));
    expect(out.filter((x) => x.kind === "post")).toHaveLength(60);
    expect(out.filter((x) => x.kind === "shot")).toHaveLength(10);
  });

  it("keeps both in the order they came", () => {
    const out = mixShots(posts(60), shots(10));
    expect(out.filter((x) => x.kind === "post").map((x) => x.item)).toEqual(posts(60));
    expect(
      out.filter((x) => x.kind === "shot").map((x) => (x.item as { id: string }).id)
    ).toEqual(shots(10).map((s) => s.id));
  });

  it("is the same every time — no reshuffling between renders", () => {
    // Server and browser must draw the same grid, and a re-render must not
    // move a Shot the reader is looking at.
    expect(mixShots(posts(60), shots(10))).toEqual(mixShots(posts(60), shots(10)));
  });

  it("never puts two shots side by side while there are posts to separate them", () => {
    const out = mixShots(posts(80), shots(10));
    for (let i = 1; i < out.length; i++) {
      expect(out[i].kind === "shot" && out[i - 1].kind === "shot").toBe(false);
    }
  });

  it("spaces them 3 to 7 posts apart, varying", () => {
    const out = mixShots(posts(100), shots(12));
    const at = out.flatMap((x, i) => (x.kind === "shot" ? [i] : []));
    const gaps = at.slice(1).map((v, i) => v - at[i] - 1);
    for (const g of gaps) {
      expect(g).toBeGreaterThanOrEqual(3);
      expect(g).toBeLessThanOrEqual(7);
    }
    expect(new Set(gaps).size).toBeGreaterThan(1); // actually scattered
  });

  it("puts a shot on the first screen", () => {
    const out = mixShots(posts(60), shots(5));
    expect(out.findIndex((x) => x.kind === "shot")).toBeLessThan(7);
  });

  it("hands leftover shots back rather than clumping or dropping them", () => {
    // This used to append all four in a row. The gap logic exists to stop
    // two videos sitting together, and the tail loop undid it: with few
    // posts and several Shots the bottom of Discover was a wall of video.
    //
    // They are not dropped either — the caller mixes `rest` into the pages
    // that arrive later, because a dropped Shot in Discover is a new Shot
    // nobody ever sees.
    const { mixed, rest } = mixShotsSplit(posts(3), shots(4));
    const placed = mixed.filter((x) => x.kind === "shot");
    expect(placed.length + rest.length).toBe(4);
    expect(rest.length).toBeGreaterThan(0);
  });

  it("and never more than two of them together", () => {
    const out = mixShots(posts(3), shots(4));
    let run = 0;
    let worst = 0;
    for (const t of out) {
      run = t.kind === "shot" ? run + 1 : 0;
      worst = Math.max(worst, run);
    }
    expect(worst).toBeLessThanOrEqual(MAX_RUN);
  });

  it("handles no shots and no posts", () => {
    expect(mixShots(posts(3), [])).toHaveLength(3);
    expect(mixShots([], shots(2))).toHaveLength(2);
  });
});

describe("gapFor", () => {
  it("is within bounds and stable", () => {
    for (const s of shots(50)) {
      const g = gapFor(s.id);
      expect(g).toBeGreaterThanOrEqual(3);
      expect(g).toBeLessThanOrEqual(7);
      expect(gapFor(s.id)).toBe(g);
    }
  });
});
