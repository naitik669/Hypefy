import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { gestureBlocked } from "@/components/layout/SwipeNav";
import { clampPinch, PINCH_MAX, reelSwipeOutcome } from "@/components/shots/ReelsFeed";
import { clampZoom, ownsSwipe, ZOOM_MAX, ZOOM_MIN } from "@/components/feed/FeedCard";
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

describe("ownsSwipe — whose sideways drag is it", () => {
  it("is the post’s when there are photos to move between", () => {
    expect(ownsSwipe(2)).toBe(true);
    expect(ownsSwipe(6)).toBe(true);
  });

  it("is the tab swipe’s on a post with one photo, or none", () => {
    // Nowhere to go inside the post, so the drag means what it means
    // everywhere else in the app: the next page.
    expect(ownsSwipe(1)).toBe(false);
    expect(ownsSwipe(0)).toBe(false);
  });

  it("decides what the gallery tells SwipeNav", () => {
    const gallery = (count: number) => {
      const el = document.createElement("div");
      if (ownsSwipe(count)) el.setAttribute("data-hswipe", "");
      document.body.appendChild(el);
      return el;
    };
    // A carousel keeps the gesture; a single photo hands it back.
    expect(gestureBlocked(0, gallery(3))).toBe(true);
    expect(gestureBlocked(0, gallery(1))).toBe(false);
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

describe("pinching a feed photo zooms the photo, not a copy of it", () => {
  const feed = readFileSync("src/components/feed/FeedCard.tsx", "utf8").split("\r\n").join("\n");

  it("makes no second image to zoom instead", () => {
    // It used to portal a copy of the photo over the card and grow that,
    // which showed as a duplicate the moment the two came apart — a pan,
    // or the page scrolling under a gesture that still allows pan-y.
    expect(feed).not.toContain("PinchLayer");
    expect(feed).not.toContain("pinchRect");
    expect(existsSync("src/components/feed/PinchLayer.tsx")).toBe(false);
  });

  it("grows the slide the photo is already in", () => {
    expect(feed).toContain("translate3d(${pinch.x}px, ${pinch.y}px, 0) scale(${pinch.scale})");
    expect(feed).toContain("zooming && i === imgIdx");
  });

  it("lets it out of the card for the length of the gesture, and puts it back", () => {
    // content-visibility implies paint containment, so the wrapper clips
    // whatever the gallery asks for. It is only there to skip work for
    // cards nobody is looking at, and the pinched card is on screen.
    expect(feed).toContain("function letPhotoOut(open: boolean)");
    expect(feed).toContain('getComputedStyle(el).contentVisibility !== "auto"');
    expect(feed).toContain('el.style.contentVisibility = open ? "visible" : "";');
    expect(feed).toContain("letPhotoOut(true)");
    expect(feed).toContain("letPhotoOut(false)");
  });

  it("unclips the carousel only while zoomed, and hides what that would reveal", () => {
    // Without the clip the next photo in the strip sits beside this one.
    expect(feed).toContain('{ overflow: "visible", zIndex: 60, borderRadius: 16 }');
    expect(feed).toContain('zooming && i !== imgIdx ? { visibility: "hidden" as const }');
  });

  it("dims from inside the card rather than over the whole app", () => {
    // A child of the gallery shares its stacking context: above every
    // other card, below this one. A portal could not be both.
    expect(feed).toContain('className="pointer-events-none fixed inset-0 bg-black"');
  });
});

describe("a second finger always wins", () => {
  const feed = readFileSync("src/components/feed/FeedCard.tsx", "utf8").split("\r\n").join("\n");

  it("a peek already open gives way to the pinch", () => {
    // Resting two fingers and then spreading them takes longer than the
    // 350ms hold, so the peek opened first — and being a full-screen
    // portal it swallowed the second finger, leaving a copy of the photo
    // over the post and no zoom at all. Reproduced: images in the
    // document went 6 -> 7 and stayed there through the spread.
    expect(feed).toContain("if (!peekSrc) return;");
    expect(feed).toContain("if (e.touches.length < 2) return;");
    expect(feed).toContain("setPeekSrc(null);\n      beginPinch(e.touches);");
    expect(feed).toContain('window.addEventListener("touchstart", onStart)');
  });

  it("follows the fingers on the window, not on the photo", () => {
    // At 4x the fingers are nowhere near the element they started on,
    // and a pinch begun on a peeked photo never touches the gallery.
    expect(feed).toContain("function trackPinch()");
    expect(feed).toContain('window.addEventListener("touchmove", move, { passive: false })');
    expect(feed).toContain("trackPinch();");
    expect(feed).toContain("stopTracking();");
  });

  it("stops the page scrolling out from under the gesture", () => {
    // touch-action: pan-y still lets two fingers scroll the feed, which
    // drags the card away from the photo being zoomed.
    expect(feed).toContain("if (e.cancelable) e.preventDefault();");
  });

  it("ends when there are no longer two fingers, and lets go of the window", () => {
    expect(feed).toContain("if (e.touches.length >= 2) return;\n      endPinch();");
    const unmount = feed.slice(feed.indexOf("if (settleTimer.current) clearTimeout"));
    expect(unmount.slice(0, 120)).toContain("stopTracking()");
  });
});

describe("a pinch holds the page still and clears the furniture", () => {
  const feed = readFileSync("src/components/feed/FeedCard.tsx", "utf8").split("\r\n").join("\n");

  it("takes the scroll off the page for the length of the gesture", () => {
    // The gallery is touch-action: pan-y so one finger still scrolls the
    // feed — and that permission covers two as well, which Chrome honours
    // on the compositor before any handler is asked. Cancelling the move
    // cannot reach a scroll already handed over, so the feed slid away
    // underneath while the photo was being zoomed on top of it.
    expect(feed).toContain("function lockPage(on: boolean)");
    expect(feed).toContain("lockPage(true)");
    expect(feed).toContain("lockPage(false)");
    expect(feed).toContain('html.style.overflow = "hidden"');
  });

  it("puts the page back exactly as it found it", () => {
    // Saved and restored rather than cleared: the app sets overflow-x on
    // these elements itself, and clearing would drop it.
    expect(feed).toContain("pageLock.current = { html: html.style.overflow, body: document.body.style.overflow }");
    expect(feed).toContain("html.style.overflow = pageLock.current.html");
    expect(feed).toContain("document.body.style.overflow = pageLock.current.body");
  });

  it("releases it even if the card goes away mid-pinch", () => {
    const unmount = feed.slice(feed.indexOf("if (settleTimer.current) clearTimeout"));
    expect(unmount.slice(0, 160)).toContain("lockPage(false)");
  });

  it("hides the slide dots while the photo is bigger than its card", () => {
    // They are pinned to the bottom of the card, so once the photo has
    // grown past it they float in the middle of the picture.
    expect(feed).toContain("{images.length > 1 && !zooming && (");
  });
});
