/**
 * The Hypefy mark, as geometry rather than a picture.
 *
 * It is four rectangles — the two stems and crossbar of a blocky H, and the
 * square full stop that follows it — taken off the app icon and recentred in
 * a 24-unit box. Kept as numbers because the same mark has to be drawn twice
 * in two different renderers: as SVG in the DOM, and on a canvas when the
 * card is exported to an image. A copy of the path in each place is a pair
 * that drifts.
 *
 * The dot is listed last and separately: it is the one part that takes the
 * accent colour while the letter stays ink, in every size and both renderers.
 */

export type MarkRect = { x: number; y: number; w: number; h: number };

/** The box the rectangles below are measured in. */
export const MARK_BOX = 24;

/** The H. */
export const MARK_LETTER: MarkRect[] = [
  { x: 7.35, y: 7.4, w: 2.06, h: 8.53 },
  { x: 7.35, y: 10.41, w: 7.5, h: 2.16 },
  { x: 12.79, y: 7.4, w: 2.06, h: 8.53 },
];

/** The full stop, sitting on the letter's baseline. */
export const MARK_DOT: MarkRect = { x: 15.3, y: 14.33, w: 1.6, h: 1.6 };
