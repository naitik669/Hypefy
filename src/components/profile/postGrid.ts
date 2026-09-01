/**
 * Shared layout for the profile post grids (own profile and /u/[username]).
 *
 * Three columns, with posts claiming extra space by shape: portrait takes
 * two rows, landscape takes two columns, everything else stays a square.
 * That gives a profile some rhythm without going full masonry — a profile
 * answers "who is this person" at a glance, and a stable grid does that
 * better than a browsing pattern built for unrelated things.
 *
 * Row height has to equal column width or the squares stop being square,
 * and CSS cannot read a sibling's width. So the wrapper becomes a query
 * container and rows are derived from it: 100cqw is the wrapper's content
 * box, minus the two 0.375rem gaps, divided by three. The wrapper exists
 * only for that — cqw resolves against an *ancestor* container, so the grid
 * cannot measure itself.
 *
 * `grid-auto-flow: dense` is deliberate, and it is a trade. A two-column
 * tile that lands with only one column left wraps and leaves a hole; dense
 * backfills that hole with a later post, which nudges it ahead of one or
 * two neighbours. Strict chronology would mean visible gaps instead. Since
 * roughly four posts in five are square, holes are rare and the filler is
 * almost always the very next post — a one-slot shuffle, not a scramble.
 */
export const GRID_WRAP = "px-1.5 [container-type:inline-size]";

/**
 * The underscores in the calc are load-bearing. Tailwind turns `_` into a
 * space inside an arbitrary value, and CSS calc() requires whitespace
 * around `-` and `/` — without it the declaration is invalid and silently
 * dropped, leaving grid-auto-rows at `auto`. Rows then size to whatever
 * image lands in them and the squares stop being square, which looks
 * almost right and is easy to miss.
 */
export const GRID =
  "grid grid-cols-3 gap-1.5 [grid-auto-flow:row_dense] [grid-auto-rows:calc((100cqw_-_0.75rem)_/_3)]";

/** 4:5 and taller. A two-row slot is about 1:2, so 3:4 crops but reads. */
const TALL_MAX_RATIO = 0.8;

/**
 * 3:2 and wider. A two-column slot is about 2:1, so 16:9 sits in it almost
 * exactly. Anything narrower (4:3, say) would be cropped hard on both
 * sides and is better left square.
 */
const WIDE_MIN_RATIO = 1.5;

/**
 * The grid-placement style for a post, or undefined for a plain 1x1 tile.
 * posts.aspect_ratio is width/height (migration 0035).
 */
export function spanFor(
  ratio: number | null | undefined,
): { gridRow?: string; gridColumn?: string } | undefined {
  if (typeof ratio !== "number" || ratio <= 0) return undefined;
  if (ratio <= TALL_MAX_RATIO) return { gridRow: "span 2" };
  if (ratio >= WIDE_MIN_RATIO) return { gridColumn: "span 2" };
  return undefined;
}

/**
 * Placeholder shapes for the loading state — one tall, one wide, the rest
 * square, so the skeleton has the same rhythm as a real profile and the
 * grid does not visibly reflow when posts arrive.
 */
export const SKELETON_SPANS: ReturnType<typeof spanFor>[] = [
  undefined,
  { gridRow: "span 2" },
  undefined,
  undefined,
  { gridColumn: "span 2" },
  undefined,
  undefined,
  undefined,
  undefined,
];
