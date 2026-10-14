/**
 * The Hypefy mark, as geometry rather than a picture.
 *
 * Four rectangles — the two stems and crossbar of the blocky H, and the
 * square full stop that follows it — measured off public/icons/icon-512.png
 * pixel by pixel rather than drawn by eye. On that 512 canvas the H runs
 * x 174–328 and y 161–340, its stems are 43 across, the crossbar is 36 deep
 * at y 231, and the lime dot is a 29-square at x 347 sitting exactly on the
 * letter's baseline. Scaled by 24/202 and nudged down 1.307 so the lockup
 * sits centred in a 24-unit box.
 *
 * Kept as numbers because the same mark is drawn twice in two renderers: as
 * SVG in the DOM, and on a canvas when the card is exported to an image. A
 * copy of the path in each place is a pair that drifts.
 *
 * The earlier version was eyeballed, and it centred on the letter while
 * scaling against the whole box — so the lockup covered about 40% of the
 * width it was given and sat visibly off to one side inside the QR badge.
 * Anything placing the mark should centre on MARK_LOCKUP, not on the box.
 */

export type MarkRect = { x: number; y: number; w: number; h: number };

/** The box the rectangles below are measured in. */
export const MARK_BOX = 24;

/** Where all the ink is — the H and its full stop together. */
export const MARK_LOCKUP = { x: 0, y: 1.307, w: 24, h: 21.386 } as const;

/**
 * The letter alone, without the full stop.
 *
 * What anything centring the mark should centre on. Centre the lockup and
 * the H lands left of middle, because the dot is pulling the box three
 * units to the right — the eye reads the H as the object and the dot as
 * punctuation hanging off it, so a "centred" lockup looks off-centre.
 * Centre this instead and let the dot sit in the right-hand margin.
 */
export const MARK_H = { x: 0, y: 1.307, w: 18.416, h: 21.386 } as const;

/** The H: left stem, crossbar, right stem. */
export const MARK_LETTER: MarkRect[] = [
  { x: 0, y: 1.307, w: 5.109, h: 21.386 },
  { x: 0, y: 9.624, w: 18.416, h: 4.277 },
  { x: 13.307, y: 1.307, w: 5.109, h: 21.386 },
];

/** The full stop, on the letter's baseline and flush with the lockup's right edge. */
export const MARK_DOT: MarkRect = { x: 20.554, y: 19.248, w: 3.445, h: 3.445 };
