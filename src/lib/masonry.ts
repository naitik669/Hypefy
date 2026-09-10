/**
 * Pinterest-style masonry: each item goes into the currently shortest column.
 *
 * Pure and deliberately prefix-stable. Where item k lands depends only on
 * items 0..k-1, so appending a page never moves an item already on screen.
 * That property is the whole reason this exists instead of CSS `columns`:
 * multi-column layout rebalances every column whenever content is added, so
 * with a feed that loads as you scroll, tiles would jump between columns
 * under your thumb every time a page arrived.
 *
 * Heights are estimated, not measured. A post knows its aspect ratio before
 * its image loads, which is enough to balance the columns without waiting on
 * the network — and measuring after load would make placement depend on
 * download order, which is not stable at all.
 */

export function distribute<T>(
  items: readonly T[],
  columns: number,
  heightOf: (item: T) => number
): T[][] {
  const cols: T[][] = Array.from({ length: Math.max(1, columns) }, () => []);
  const heights = cols.map(() => 0);
  for (const item of items) {
    // Leftmost of the shortest, so ties fill left to right — the order a
    // reader's eye takes across a row.
    let target = 0;
    for (let c = 1; c < heights.length; c++) {
      if (heights[c] < heights[target]) target = c;
    }
    cols[target].push(item);
    heights[target] += Math.max(0, heightOf(item));
  }
  return cols;
}

/** 9:16 to 16:9. Beyond that a single post starts dictating the layout. */
export function clampRatio(ratio: number | null | undefined): number {
  if (typeof ratio !== "number" || !(ratio > 0)) return 1;
  return Math.min(16 / 9, Math.max(9 / 16, ratio));
}

/**
 * A pin's height in units of its column's width: the image, plus the lines of
 * text under it. The text allowance is a rough constant on purpose — it only
 * has to be close enough that two columns end up about level.
 */
export function pinHeight(p: {
  aspect_ratio: number | null;
  hasImage: boolean;
  hasCaption: boolean;
}): number {
  const media = p.hasImage ? 1 / clampRatio(p.aspect_ratio) : 5 / 4;
  return media + (p.hasCaption ? 0.3 : 0.16);
}
