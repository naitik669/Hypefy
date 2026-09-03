/**
 * Shared layout for the profile post grids (own profile and /u/[username]).
 *
 * Three columns of plain squares. Portrait posts used to take two rows,
 * which gave the page shape but cost it its rhythm: a profile answers "who
 * is this person" at a glance, and an even grid does that better than a
 * ragged one. Variety belongs in Discover, where browsing is the point.
 *
 * Row height has to equal column width for the squares to stay square, and
 * CSS cannot read a sibling's width. So the wrapper becomes a query
 * container and rows are derived from it: 100cqw is the wrapper's content
 * box, minus the two 0.375rem gaps, divided by three. The wrapper exists
 * only for that — cqw resolves against an *ancestor* container, so the grid
 * cannot measure itself.
 */
export const GRID_WRAP = "px-1.5 [container-type:inline-size]";

/**
 * The underscores in the calc are load-bearing. Tailwind turns `_` into a
 * space inside an arbitrary value, and CSS calc() requires whitespace
 * around `-` and `/` — without it the declaration is invalid and silently
 * dropped, leaving grid-auto-rows at `auto`. Rows then size to whatever
 * image lands in them, which looks almost right and is easy to miss.
 */
export const GRID =
  "grid grid-cols-3 gap-1.5 [grid-auto-rows:calc((100cqw_-_0.75rem)_/_3)]";
