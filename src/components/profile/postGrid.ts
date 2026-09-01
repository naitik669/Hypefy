/**
 * Shared layout for the profile post grids (own profile and /u/[username]).
 *
 * Still three columns — a profile answers "who is this person" at a glance,
 * and a stable rhythm does that better than full masonry — but portrait
 * posts take two rows so the page has some shape to it.
 *
 * Row height has to equal column width for the squares to stay square, and
 * CSS cannot read a sibling's width. So the wrapper becomes a query
 * container and rows are derived from it: 100cqw is the wrapper's content
 * box, minus the two 0.375rem gaps, divided by three. The wrapper exists
 * only for that — cqw resolves against an *ancestor* container, so the grid
 * cannot measure itself.
 *
 * No `grid-auto-flow: dense`. Dense backfills holes by pulling later posts
 * forward, which silently reorders a chronological profile. Every item is
 * one column wide, so plain auto-placement leaves no holes anyway.
 */
export const GRID_WRAP = "px-1.5 [container-type:inline-size]";

export const GRID =
  "grid grid-cols-3 gap-1.5 [grid-auto-rows:calc((100cqw-0.75rem)/3)]";

/** 4:5 and taller. Anything wider still reads fine cropped to a square. */
const TALL_MAX_RATIO = 0.8;

/**
 * posts.aspect_ratio is width/height (migration 0035). Null on anything
 * posted before that, which falls back to a square tile.
 */
export function isTall(ratio: number | null | undefined): boolean {
  return typeof ratio === "number" && ratio > 0 && ratio <= TALL_MAX_RATIO;
}
