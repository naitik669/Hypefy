/**
 * The judgements the dashboard's first screen makes, kept out of the JSX.
 *
 * Same reason creator-insights.ts exists: a decision written inline in a
 * server component can only be tested by matching the file as text, and a
 * text test cannot tell a live branch from a dead one.
 */

export type DailyRow = { day: string; views: number | null; followers: number | null };

/** An item as creator_item_stats returns it, loosely — only what is read here. */
export type StatItem = {
  kind: string;
  id: string;
  caption: string | null;
  cover: string | null;
  created_at: string;
  views: number | null;
  reach: number | null;
  avg_completion?: number | null;
};

/** How far back "lately" reaches. */
export const RECENT_DAYS = 30;

/**
 * The best thing you posted recently, or null.
 *
 * Recent AND best, not simply best: the all-time winner is the same row
 * every time you open the screen, which stops being information after the
 * second look. Thirty days keeps it moving.
 *
 * Ranked by reach rather than views, so a post seen three times each by
 * forty people beats one seen ninety times by six. Ties break on views,
 * then on being newer — a dead heat should show the fresher one.
 *
 * Anything with no reach at all is not a candidate: "doing best" about a
 * post nobody saw is worse than showing nothing.
 */
export function bestRecent(items: StatItem[], now = Date.now()): StatItem | null {
  const cutoff = now - RECENT_DAYS * 24 * 60 * 60 * 1000;
  const recent = items.filter((i) => {
    // An unparseable date gives NaN, and every comparison against NaN is
    // false, so it fails the window check on its own. There was an
    // explicit Number.isFinite guard here until a mutation showed that
    // removing it changed nothing — it was defence against a case the next
    // line already handles.
    const at = new Date(i.created_at).getTime();
    return at >= cutoff && Number(i.reach ?? 0) > 0;
  });
  if (recent.length === 0) return null;

  return recent.reduce((best, i) => {
    const a = Number(i.reach ?? 0);
    const b = Number(best.reach ?? 0);
    if (a !== b) return a > b ? i : best;
    const av = Number(i.views ?? 0);
    const bv = Number(best.views ?? 0);
    if (av !== bv) return av > bv ? i : best;
    return new Date(i.created_at) > new Date(best.created_at) ? i : best;
  });
}

/**
 * A date as a chart label: "14 Nov" shortened to "14/11".
 *
 * Numeric on purpose. A month name is three characters wider than the
 * space a thirty-day axis has for each label, and the alternative to
 * shortening is printing fewer of them.
 */
export function dayLabel(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}
