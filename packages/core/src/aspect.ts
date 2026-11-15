/**
 * The shapes the feed draws posts in.
 *
 * A post is stored at whatever shape it was composed at, down to 0.4 (a
 * screenshot two and a half times taller than it is wide). Drawn at that
 * shape, one post fills the screen and then some — you scroll past a single
 * picture, and the feed stops reading as a feed. So the stored ratio is the
 * post's own, and this is what the feed shows it at: never taller than 4:5,
 * never wider than 1.91:1. Anything outside is cropped to fit, the same crop
 * the picture already gets from object-cover.
 */
const TALLEST = 4 / 5;
const WIDEST = 1.91;

export function feedRatio(ratio: number | null | undefined): number {
  if (typeof ratio !== "number" || !(ratio > 0)) return 1;
  return Math.min(WIDEST, Math.max(TALLEST, ratio));
}
