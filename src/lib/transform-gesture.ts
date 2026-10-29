/**
 * Moving, sizing and turning a thing with a finger.
 *
 * FramePlacer has done this for avatar frames since frames shipped, and
 * its comment says what a placer is for: "nobody positions artwork by
 * typing a number into three boxes — you move the thing until it looks
 * right." The same is true of a sticker on a Show, so the maths moves
 * here, pure, and the component becomes the thin part.
 *
 * Two differences from the frame placer, both because a Show is not an
 * avatar. Position is a fraction of the frame rather than a number of
 * avatar widths, so a layer lands in the same place at any size; and
 * there is pinch, because a phone has two thumbs and a placer in an
 * admin screen never needed it.
 *
 * Every function takes points already in the frame's own pixels. Nothing
 * here touches the DOM, so all of it is testable.
 */

import { LAYER_POS_MAX, LAYER_POS_MIN, LAYER_SCALE_MAX, LAYER_SCALE_MIN } from "@/lib/show-layers";

export type Point = { x: number; y: number };

/** Where a layer is, as the editor holds it mid-gesture. */
export type Placed = { x: number; y: number; scale: number; rotation: number };

/** How close to a multiple of 45° counts as meaning it. */
export const SNAP_DEGREES = 45;
export const SNAP_WITHIN = 4;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Degrees in (-180, 180], so turning right round comes back. */
export function wrapDegrees(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}

/**
 * Snapped to the eight obvious angles when it is nearly one of them.
 *
 * Most of what anyone actually wants, and fiddly to hit by hand — the
 * frame placer's reasoning, and the same tolerance.
 */
export function snapAngle(deg: number): number {
  const near = Math.round(deg / SNAP_DEGREES) * SNAP_DEGREES;
  return Math.abs(deg - near) < SNAP_WITHIN ? wrapDegrees(near) : wrapDegrees(deg);
}

/**
 * Dragged from one point to another.
 *
 * The movement is divided by the frame, because position is a fraction
 * of it: dragging a third of the way across should be a third at any
 * screen size.
 */
export function dragged(
  from: Placed,
  start: Point,
  now: Point,
  frame: { width: number; height: number },
): Placed {
  if (frame.width <= 0 || frame.height <= 0) return from;
  return {
    ...from,
    x: clamp(from.x + (now.x - start.x) / frame.width, LAYER_POS_MIN, LAYER_POS_MAX),
    y: clamp(from.y + (now.y - start.y) / frame.height, LAYER_POS_MIN, LAYER_POS_MAX),
  };
}

/**
 * Sized by pulling a corner.
 *
 * Distance from the centre as a ratio of where the grab began, so the
 * layer grows about its middle and the corner stays under the finger.
 */
export function pulled(from: Placed, centre: Point, start: Point, now: Point): Placed {
  const startDist = Math.hypot(start.x - centre.x, start.y - centre.y) || 1;
  const dist = Math.hypot(now.x - centre.x, now.y - centre.y);
  return {
    ...from,
    scale: clamp((from.scale * dist) / startDist, LAYER_SCALE_MIN, LAYER_SCALE_MAX),
  };
}

/** Turned by swinging the handle above it. */
export function swung(from: Placed, centre: Point, start: Point, now: Point): Placed {
  const startAngle = Math.atan2(start.y - centre.y, start.x - centre.x);
  const angle = Math.atan2(now.y - centre.y, now.x - centre.x);
  const deg = from.rotation + ((angle - startAngle) * 180) / Math.PI;
  return { ...from, rotation: snapAngle(deg) };
}

/**
 * Two fingers: size and turn together, which is how a photo is handled
 * everywhere and the one gesture the frame placer never had.
 *
 * Both are measured against where the pinch started rather than the last
 * frame, so a slow pinch does not drift by accumulating rounding.
 */
export function pinched(
  from: Placed,
  startA: Point,
  startB: Point,
  a: Point,
  b: Point,
): Placed {
  const was = Math.hypot(startB.x - startA.x, startB.y - startA.y);
  const now = Math.hypot(b.x - a.x, b.y - a.y);
  // Two fingers in the same place say nothing about size; leave it be
  // rather than dividing by it.
  const scale = was > 1 ? clamp((from.scale * now) / was, LAYER_SCALE_MIN, LAYER_SCALE_MAX) : from.scale;

  const wasAngle = Math.atan2(startB.y - startA.y, startB.x - startA.x);
  const nowAngle = Math.atan2(b.y - a.y, b.x - a.x);
  const turned = from.rotation + ((nowAngle - wasAngle) * 180) / Math.PI;

  return { ...from, scale, rotation: snapAngle(turned) };
}

/**
 * Which layer a tap landed on: the top one whose box contains it.
 *
 * Back to front is the stacking order, so the search runs the other way
 * — the thing drawn last is the thing you see, and so the thing you
 * meant. Boxes are axis-aligned and ignore rotation, which makes a
 * turned layer slightly generous at its corners; that is the right way
 * to be wrong for something being pressed by a thumb.
 */
export function topmostAt(
  point: Point,
  boxes: readonly { id: string; left: number; top: number; width: number; height: number }[],
): string | null {
  for (let i = boxes.length - 1; i >= 0; i--) {
    const b = boxes[i];
    if (
      point.x >= b.left &&
      point.x <= b.left + b.width &&
      point.y >= b.top &&
      point.y <= b.top + b.height
    ) {
      return b.id;
    }
  }
  return null;
}
