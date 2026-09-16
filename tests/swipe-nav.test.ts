import { describe, it, expect } from "vitest";
import {
  lockAxis,
  holdScroll,
  swipeOutcome,
  inHorizontalScroller,
  gestureBlocked,
} from "@/components/layout/SwipeNav";

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

describe("holdScroll", () => {
  it("holds the browser back only from a move that is already clearly sideways", () => {
    expect(holdScroll(5, 1)).toBe(true);
    expect(holdScroll(-4, 0)).toBe(true);
    expect(holdScroll(3, 3)).toBe(false);
    expect(holdScroll(1, 6)).toBe(false);
    expect(holdScroll(0, 0)).toBe(false);
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

/**
 * Which touches navigation must keep its hands off.
 *
 * The post gallery is the case that actually bit: swiping between a post's
 * photos navigated to Messages, because the gallery is `overflow-hidden` with
 * a JS transform and so looks nothing like a scroller to a computed-style
 * check.
 */
describe("inHorizontalScroller", () => {
  function el(html: string): Element {
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.appendChild(host);
    return host.firstElementChild!;
  }

  it("releases a touch inside a JS carousel marked with data-hswipe", () => {
    const gallery = el(`<div data-hswipe=""><img /></div>`);
    expect(inHorizontalScroller(gallery)).toBe(true);
    // And from a child, since the touch lands on the image, not the wrapper.
    expect(inHorizontalScroller(gallery.querySelector("img"))).toBe(true);
  });

  it("keeps a touch that is not in one", () => {
    const plain = el(`<div><p>caption</p></div>`);
    expect(inHorizontalScroller(plain.querySelector("p"))).toBe(false);
  });

  it("survives a non-element target", () => {
    expect(inHorizontalScroller(null)).toBe(false);
  });
});

describe("gestureBlocked", () => {
  it("blocks while any overlay is open, whatever was touched", () => {
    expect(gestureBlocked(1, null)).toBe(true);
  });

  it("allows an ordinary touch with nothing open", () => {
    expect(gestureBlocked(0, null)).toBe(false);
  });
});
