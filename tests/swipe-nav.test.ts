import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  lockAxis,
  holdScroll,
  swipeOutcome,
  inHorizontalScroller,
  gestureBlocked,
  heldReach,
  type Reach,
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

/**
 * The rehype deck owns its own sideways drag.
 *
 * Pulling a face off the stack is a horizontal gesture over the picture. The
 * gallery behind it only claims that gesture when it has more than one image
 * to move between, so on a single-image post nothing stood the tab swipe
 * down and dragging a face changed tab instead.
 */
describe("dragging a rehyped face", () => {
  it("the deck says the sideways drag is its own", () => {
    const src = readFileSync("src/components/feed/RehypeDeck.tsx", "utf8");
    expect(src).toContain('data-hswipe=""');
  });

  it("so the tab swipe stands down over it, whatever the post holds", () => {
    const deck = document.createElement("div");
    deck.setAttribute("data-hswipe", "");
    const face = document.createElement("button");
    deck.appendChild(face);
    document.body.appendChild(deck);
    try {
      expect(inHorizontalScroller(face)).toBe(true);
    } finally {
      deck.remove();
    }
  });
});

/**
 * Which neighbour a drag is reaching for.
 *
 * This is not cosmetic: the destination is a whole mounted screen, so every
 * change of mind tears one down and builds another in the middle of the
 * gesture. Read as the bare sign of the movement, a swipe that wobbled
 * across its own starting point did that several times and stuck on each.
 */
describe("heldReach", () => {
  it("the first clear movement decides", () => {
    expect(heldReach(-20, 0)).toBe(1);
    expect(heldReach(20, 0)).toBe(-1);
  });

  it("exactly nowhere decides nothing", () => {
    expect(heldReach(0, 0)).toBe(0);
    expect(heldReach(0, 1)).toBe(1);
  });

  it("holds through a wobble back over the start", () => {
    let held: Reach = heldReach(-40, 0);
    expect(held).toBe(1);
    // The finger drifts back past where it began — but only just.
    held = heldReach(-1, held);
    expect(held).toBe(1);
    held = heldReach(5, held);
    expect(held).toBe(1);
    held = heldReach(20, held);
    expect(held).toBe(1);
  });

  it("gives way to a real reversal", () => {
    expect(heldReach(30, 1)).toBe(-1);
    expect(heldReach(-30, -1)).toBe(1);
  });

  it("the turn is the same distance either way", () => {
    expect(heldReach(27, 1)).toBe(1);
    expect(heldReach(28, 1)).toBe(-1);
    expect(heldReach(-27, -1)).toBe(-1);
    expect(heldReach(-28, -1)).toBe(1);
  });

  it("once turned, it stays turned without re-crossing", () => {
    let held: Reach = heldReach(-40, 0);
    held = heldReach(40, held);
    expect(held).toBe(-1);
    expect(heldReach(5, held)).toBe(-1);
  });
});

describe("the cost of a gesture", () => {
  const src = readFileSync("src/components/layout/SwipeNav.tsx", "utf8").split("\r\n").join("\n");

  it("the tab being pulled in is chosen once, not per frame", () => {
    expect(src).toContain("const dir = heldReach(ddx, reach.current);");
    expect(src).not.toContain("const toNext = ddx < 0;");
  });

  it("a frame writes only the styles that changed", () => {
    expect(src).toContain("if (el.style.transition !== t) el.style.transition = t;");
    expect(src).toContain("if (el.style.transform !== transform) el.style.transform = transform;");
  });

  it("an ancestor is measured before its style is resolved", () => {
    // getComputedStyle on every parent of the touch, at the start of every
    // gesture, down a tree a dozen deep inside a feed card.
    const walk = src.slice(src.indexOf("export function inHorizontalScroller"));
    expect(walk.indexOf("el.scrollWidth > el.clientWidth + 4")).toBeLessThan(
      walk.indexOf("getComputedStyle(el).overflowX"),
    );
  });
});
