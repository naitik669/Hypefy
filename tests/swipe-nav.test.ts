import { describe, it, expect } from "vitest";
import { lockAxis, swipeOutcome } from "@/components/layout/SwipeNav";

/**
 * The two decisions that make swipe-to-navigate either invisible or
 * infuriating: when to claim a gesture, and when to act on it.
 */
describe("lockAxis", () => {
  it("stays undecided until the finger has actually moved", () => {
    expect(lockAxis(0, 0)).toBeNull();
    expect(lockAxis(4, 3)).toBeNull();
  });

  it("claims a clearly sideways drag", () => {
    expect(lockAxis(40, 2)).toBe("x");
    expect(lockAxis(-40, -5)).toBe("x");
  });

  it("leaves a scroll alone", () => {
    expect(lockAxis(2, 40)).toBe("y");
    expect(lockAxis(-6, -30)).toBe("y");
  });

  it("gives a diagonal to the page, not to navigation", () => {
    // Equal parts sideways and down is someone scrolling with a lazy thumb.
    // Stealing that is worse than missing the occasional swipe.
    expect(lockAxis(30, 30)).toBe("y");
    expect(lockAxis(30, 25)).toBe("y");
    // Only once it is decisively sideways do we take it.
    expect(lockAxis(30, 15)).toBe("x");
  });
});

describe("swipeOutcome", () => {
  const W = 400;
  const slow = { width: W, elapsed: 600, canPrev: true, canNext: true };

  it("ignores a short, slow drag", () => {
    expect(swipeOutcome({ ...slow, dx: -40 })).toBe("stay");
  });

  it("commits once the drag crosses roughly a quarter of the screen", () => {
    expect(swipeOutcome({ ...slow, dx: -0.3 * W })).toBe("next");
    expect(swipeOutcome({ ...slow, dx: 0.3 * W })).toBe("prev");
  });

  it("commits on a fast flick that never travels far", () => {
    // 60px in 60ms — the whole point of a flick is not having to drag.
    expect(
      swipeOutcome({ ...slow, dx: -60, elapsed: 60 }),
    ).toBe("next");
  });

  it("does not treat a tiny twitch as a flick", () => {
    expect(swipeOutcome({ ...slow, dx: -12, elapsed: 8 })).toBe("stay");
  });

  it("refuses to leave the ends of the tab list", () => {
    // Swiping right on the first tab, or left on the last, has nowhere to go.
    expect(
      swipeOutcome({ ...slow, dx: 0.9 * W, canPrev: false }),
    ).toBe("stay");
    expect(
      swipeOutcome({ ...slow, dx: -0.9 * W, canNext: false }),
    ).toBe("stay");
  });

  it("is symmetric — the same drag either way commits either way", () => {
    const d = 0.35 * W;
    expect(swipeOutcome({ ...slow, dx: -d })).toBe("next");
    expect(swipeOutcome({ ...slow, dx: d })).toBe("prev");
  });
});
