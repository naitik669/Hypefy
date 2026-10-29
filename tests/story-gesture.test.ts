import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  STORY_DISMISS_PX,
  STORY_SWIPE_PX,
  STORY_TAP_MS,
  STORY_TAP_SLOP_PX,
  storyGesture,
  storyKey,
} from "@/lib/story-gesture";

/**
 * The Show viewer had two tap zones and nothing else: no swipe between
 * people, no swipe down to leave, no keyboard, no way out but the X.
 * Diary's player has had all of it since it shipped, so the rules move
 * into one pure place rather than being written a second time.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const viewer = read("src/components/shows/ShowViewer.tsx");

const press = (over: Partial<Parameters<typeof storyGesture>[0]> = {}) =>
  storyGesture({ dx: 0, dy: 0, ms: 100, x: 300, width: 390, ...over });

describe("what a press meant", () => {
  it("a tap on the left third goes back", () => {
    expect(press({ x: 40 })).toBe("prev");
  });

  it("and anywhere else goes on", () => {
    expect(press({ x: 200 })).toBe("next");
    expect(press({ x: 389 })).toBe("next");
    // Exactly on the line belongs to the larger side.
    expect(press({ x: 130, width: 390 })).toBe("next");
  });

  it("a swipe left goes on, a swipe right goes back", () => {
    expect(press({ dx: -STORY_SWIPE_PX - 1 })).toBe("next");
    expect(press({ dx: STORY_SWIPE_PX + 1 })).toBe("prev");
  });

  it("a swipe down puts the story away", () => {
    expect(press({ dy: STORY_DISMISS_PX + 1 })).toBe("close");
  });

  it("but a swipe up does not", () => {
    // Only downward. Up is how a reply sheet would be pulled in later.
    expect(press({ dy: -200 })).toBe(null);
  });

  it("a hold is deliberately nothing", () => {
    // It paused the clock while the finger was down; letting go should
    // not also move somebody off the thing they stopped to look at.
    expect(press({ ms: STORY_TAP_MS + 1 })).toBe(null);
  });

  it("and so is a half-hearted drag", () => {
    // Short of every threshold and too long to be a tap.
    expect(press({ dx: 30, dy: 20, ms: 600 })).toBe(null);
  });

  it("a tap is allowed to wander, but not far", () => {
    expect(press({ dx: STORY_TAP_SLOP_PX - 1, dy: 0, x: 40 })).toBe("prev");
    expect(press({ dx: STORY_TAP_SLOP_PX + 1, dy: 0, ms: 600 })).toBe(null);
  });

  it("down beats sideways, and sideways beats a tap", () => {
    // The order is the point: a flick that drifts should still do the
    // thing it was mostly.
    expect(press({ dx: 70, dy: 200 })).toBe("close");
    expect(press({ dx: -200, dy: 70 })).toBe("next");
  });

  it("a surface with no width still answers", () => {
    // Measured before layout, or on a hidden page.
    expect(press({ width: 0, x: 0 })).toBe("next");
  });
});

describe("the same from a keyboard", () => {
  it("arrows move, Escape leaves", () => {
    expect(storyKey("ArrowRight")).toBe("next");
    expect(storyKey("ArrowLeft")).toBe("prev");
    expect(storyKey("Escape")).toBe("close");
  });

  it("and nothing else does anything", () => {
    for (const k of ["a", " ", "Enter", "ArrowUp", "ArrowDown", "Tab"]) {
      expect(storyKey(k)).toBe(null);
    }
  });
});

describe("the viewer uses it", () => {
  it("one gesture surface, not two tap zones", () => {
    expect(viewer).toContain("onPointerDown={onPressDown}");
    expect(viewer).toContain("storyGesture({");
    expect(viewer).not.toContain('className="absolute left-0 z-10 w-1/3"');
  });

  it("the chrome above and below stays reachable", () => {
    // The reply field, the hype button and the author row sit outside it.
    const surface = viewer.slice(viewer.indexOf("{!menuOpen && ("));
    expect(surface.slice(0, 420)).toContain("top: 88, bottom: 88");
  });

  it("holding pauses the clock, and letting go releases it", () => {
    const down = viewer.slice(viewer.indexOf("function onPressDown"));
    expect(down.slice(0, 260)).toContain("setPaused(true);");
    const up = viewer.slice(viewer.indexOf("function onPressUp"));
    expect(up.slice(0, 200)).toContain("setPaused(false);");
  });

  it("a cancelled press releases it too", () => {
    // A pointercancel with the clock left paused is a story that never
    // moves again.
    const cancel = viewer.slice(viewer.indexOf("function onPressCancel"));
    expect(cancel.slice(0, 160)).toContain("setPaused(false);");
  });

  it("and the keyboard keeps out of a reply being typed", () => {
    expect(viewer).toContain("el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement");
  });
});
