/**
 * What a press on a full-screen story meant.
 *
 * Diary's player has had tap, swipe sideways, swipe down and hold since it
 * shipped; the Show viewer had two tap zones and nothing else — no swipe
 * between people, no keyboard, no way out but the X. Rather than write the
 * rules a second time they move here, pure, so the two players cannot
 * drift apart and the thresholds can be argued about in one place.
 *
 * Pointer position is given relative to the surface, so this needs no DOM.
 */

/** Sideways travel before a press counts as moving between Shows. */
export const STORY_SWIPE_PX = 60;
/** Downward travel before it counts as putting the story away. */
export const STORY_DISMISS_PX = 90;
/** Longer than this and the press was a hold to look, not a tap. */
export const STORY_TAP_MS = 250;
/** A tap is allowed to wander this far and still be a tap. */
export const STORY_TAP_SLOP_PX = 10;
/** The left part of the frame goes back; the rest goes on. */
export const STORY_BACK_SHARE = 1 / 3;

export type StoryMove = "next" | "prev" | "close" | null;

/**
 * The press, decided in one place.
 *
 * Order matters and is the point: a downward flick is a dismissal even
 * when it drifts sideways, a sideways flick moves between people even
 * when it drifts down, and only a press that went almost nowhere is a
 * tap. Everything else — a long hold to read, a half-hearted drag — is
 * deliberately nothing, because a story that acts on an ambiguous gesture
 * is one you cannot read without losing your place.
 */
export function storyGesture(press: {
  /** Pointer travel, in CSS pixels. */
  dx: number;
  dy: number;
  /** How long the press lasted, in milliseconds. */
  ms: number;
  /** Where it ended, measured from the surface's left edge. */
  x: number;
  /** The surface's width, for the tap halves. */
  width: number;
}): StoryMove {
  const { dx, dy, ms, x, width } = press;

  if (dy > STORY_DISMISS_PX && Math.abs(dy) > Math.abs(dx)) return "close";
  if (Math.abs(dx) > STORY_SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
    return dx < 0 ? "next" : "prev";
  }
  if (ms < STORY_TAP_MS && Math.abs(dx) < STORY_TAP_SLOP_PX && Math.abs(dy) < STORY_TAP_SLOP_PX) {
    if (width <= 0) return "next";
    return x < width * STORY_BACK_SHARE ? "prev" : "next";
  }
  return null;
}

/** The same decision from a keyboard, which the Show viewer never had. */
export function storyKey(key: string): StoryMove {
  if (key === "ArrowRight") return "next";
  if (key === "ArrowLeft") return "prev";
  if (key === "Escape") return "close";
  return null;
}
