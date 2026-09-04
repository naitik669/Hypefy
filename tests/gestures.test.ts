import { describe, it, expect } from "vitest";
import { gestureBlocked } from "@/components/layout/SwipeNav";
import { clampPinch, PINCH_MAX } from "@/components/shots/ReelsFeed";

/**
 * The rules that decide whether a touch belongs to the page or to something
 * on top of it. Both were bugs before they were functions.
 */
describe("gestureBlocked", () => {
  it("releases the gesture whenever an overlay is open", () => {
    // The comments sheet portals to <body>, but React routes events through
    // the component tree — so a drag inside the sheet still reached the tab
    // swipe and changed page out from under whatever was being read.
    expect(gestureBlocked(1, null)).toBe(true);
    expect(gestureBlocked(3, null)).toBe(true);
  });

  it("leaves the gesture alone when nothing is open", () => {
    // null target cannot be inside a horizontal scroller, so this isolates
    // the overlay half of the rule.
    expect(gestureBlocked(0, null)).toBe(false);
  });
});

describe("clampPinch", () => {
  it("scales with the gap between the fingers", () => {
    expect(clampPinch(1, 100, 200)).toBe(2);
    expect(clampPinch(1, 100, 300)).toBe(3);
  });

  it("continues from where the last pinch left off", () => {
    expect(clampPinch(2, 100, 150)).toBe(3);
  });

  it("never goes below life size", () => {
    // A reel is object-cover; below 1 it would show bars, which reads as
    // broken rather than as zoomed out.
    expect(clampPinch(1, 200, 50)).toBe(1);
    expect(clampPinch(2, 200, 10)).toBe(1);
  });

  it("caps the zoom", () => {
    expect(clampPinch(1, 10, 10000)).toBe(PINCH_MAX);
  });

  it("survives a zero starting gap", () => {
    // Two touches reported at the same point would divide by zero and put
    // NaN into a transform, which silently blanks the video.
    expect(Number.isFinite(clampPinch(1, 0, 120))).toBe(true);
  });
});
