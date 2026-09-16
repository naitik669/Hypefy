import { describe, it, expect } from "vitest";
import { gestureBlocked } from "@/components/layout/SwipeNav";
import { clampPinch, PINCH_MAX, reelSwipeOutcome } from "@/components/shots/ReelsFeed";
import { clampZoom, ZOOM_MAX, ZOOM_MIN } from "@/components/feed/FeedCard";
import { autoplayAllowed } from "@/components/feed/ShotFeedCard";

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

describe("clampZoom", () => {
  it("passes an ordinary pinch straight through", () => {
    expect(clampZoom(1.8)).toBe(1.8);
  });

  it("never shrinks the photo inside its own frame", () => {
    // Below 1 the card would show a gap around the image, which reads as a
    // rendering fault rather than as zooming out.
    expect(clampZoom(0.3)).toBe(ZOOM_MIN);
  });

  it("caps the zoom", () => {
    expect(clampZoom(99)).toBe(ZOOM_MAX);
  });

  it("refuses NaN and Infinity rather than blanking the image", () => {
    // Two touches reported at the same point divide by zero; NaN in a
    // transform silently renders nothing at all.
    //
    // Both non-finite cases land on "no zoom" rather than Infinity landing
    // on maximum zoom. They can only arise from a zero starting gap, which
    // means the gesture was never measurable — snapping to 4x on garbage
    // input would be a violent answer to a question nobody asked.
    expect(clampZoom(NaN)).toBe(ZOOM_MIN);
    expect(clampZoom(Infinity)).toBe(ZOOM_MIN);
    expect(clampZoom(0 / 0)).toBe(ZOOM_MIN);
  });
});

describe("autoplayAllowed", () => {
  it("plays on an ordinary device", () => {
    expect(autoplayAllowed({})).toBe(true);
    expect(
      autoplayAllowed({ effectiveType: "4g" }),
    ).toBe(true);
  });

  it("does NOT stand down for reduced motion", () => {
    // It used to, and that was the bug: Android turns prefers-reduced-motion
    // on with battery saver, so an ordinary phone setting silently disabled
    // autoplay everywhere. A muted, looping, in-place clip is not the kind of
    // motion that setting is protecting anyone from.
    expect(autoplayAllowed({})).toBe(true);
  });

  it("stands down for Save-Data", () => {
    expect(
      autoplayAllowed({ saveData: true }),
    ).toBe(false);
  });

  it("stands down on 2g and slow-2g", () => {
    // Autoplaying video here is spending someone's money without asking.
    expect(
      autoplayAllowed({ effectiveType: "2g" }),
    ).toBe(false);
    expect(
      autoplayAllowed({ effectiveType: "slow-2g" }),
    ).toBe(false);
  });

  it("does not mistake 3g for 2g", () => {
    // A suffix match on "2g" alone would catch nothing here, but a loose
    // substring match would wrongly catch "slow-2g"-shaped strings only —
    // this pins the boundary.
    expect(
      autoplayAllowed({ effectiveType: "3g" }),
    ).toBe(true);
  });
});

describe("reelSwipeOutcome", () => {
  const base = { height: 700, elapsed: 400, first: true };

  it("a sideways swipe on the first reel never leaves Shots, however far it dips", () => {
    // The bug: swiping left towards Profile dipped downward, read as
    // "pull down to leave", went back to Messages.
    expect(reelSwipeOutcome({ ...base, axis: "x", dy: 300 })).toBe("stay");
    expect(reelSwipeOutcome({ ...base, axis: "x", dy: 40, elapsed: 30 })).toBe("stay");
    expect(reelSwipeOutcome({ ...base, axis: null, dy: 300 })).toBe("stay");
  });

  it("a real pull down on the first reel still leaves", () => {
    expect(reelSwipeOutcome({ ...base, axis: "y", dy: 300 })).toBe("leave");
  });

  it("moves between reels on a vertical swipe", () => {
    expect(reelSwipeOutcome({ ...base, axis: "y", dy: -300 })).toBe("next");
    expect(reelSwipeOutcome({ ...base, first: false, axis: "y", dy: 300 })).toBe("prev");
    expect(reelSwipeOutcome({ ...base, axis: "y", dy: -20 })).toBe("stay");
  });
});
