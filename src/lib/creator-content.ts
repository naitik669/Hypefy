/**
 * The decisions the Content and Audience tabs make, kept out of the JSX.
 *
 * Same reason creator-insights.ts exists: a source-as-text test can prove
 * a string is in a file, and nothing more. Sorting, in particular, is the
 * kind of thing that keeps working after it has stopped being correct —
 * a list ordered by the wrong column still renders a list — so the
 * comparison lives here where a test can hand it rows and read the order
 * back.
 */

/** The tabs on /creator, in the order they are shown. */
export const CREATOR_TABS = ["overview", "content", "audience"] as const;

export type CreatorTab = (typeof CREATOR_TABS)[number];

/** The tab named in the address, falling back to the first one. */
export function readTab(value: unknown): CreatorTab {
  return (CREATOR_TABS as readonly string[]).includes(String(value))
    ? (value as CreatorTab)
    : "overview";
}

/** One row of creator_item_stats. */
export type ItemRow = {
  kind: string;
  id: string;
  caption: string | null;
  cover: string | null;
  created_at: string;
  views: number | string | null;
  reach: number | string | null;
  hypes: number | null;
  comments: number | null;
  saves: number | null;
  avg_completion: number | null;
};

/**
 * How the content list can be ordered.
 *
 * Four, not eight. Each one answers a question somebody actually asks of
 * their own posts; a sort by save count alone answers none of them.
 */
export const CONTENT_SORTS = [
  { key: "recent", label: "Newest" },
  { key: "views", label: "Views" },
  { key: "people", label: "People" },
  { key: "talked", label: "Reactions" },
] as const;

export type SortKey = (typeof CONTENT_SORTS)[number]["key"];

/** The sort asked for, falling back to newest. */
export function readSort(value: unknown): SortKey {
  return CONTENT_SORTS.some((s) => s.key === value) ? (value as SortKey) : "recent";
}

/**
 * A count as a number.
 *
 * Postgres counts are bigint, and a bigint crosses PostgREST as a JSON
 * number in practice but is typed as possibly a string — so every read of
 * one goes through here rather than through a cast that would quietly
 * become NaN if that ever changed.
 */
export function num(value: number | string | null | undefined): number {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

/** Hypes, comments and saves together: everything somebody chose to do. */
export function interactions(row: ItemRow): number {
  return num(row.hypes) + num(row.comments) + num(row.saves);
}

/**
 * Reactions per hundred people reached, or null when nobody saw it.
 *
 * Null rather than zero, for the reason avg_completion is null on an
 * unwatched Shot: "0%" is a claim that nobody reacted, and "no data" is
 * not the same claim.
 */
export function interactionRate(row: ItemRow): number | null {
  const reach = num(row.reach);
  if (reach <= 0) return null;
  return Math.round((interactions(row) / reach) * 1000) / 10;
}

/**
 * The list in the asked-for order, as a new array.
 *
 * Ties break on recency in every mode, so two posts with the same view
 * count do not swap places between renders — an unstable order in a list
 * somebody is reading down is its own small bug.
 */
export function sortItems(rows: readonly ItemRow[], by: SortKey): ItemRow[] {
  const newest = (a: ItemRow, b: ItemRow) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime();

  const score = (row: ItemRow): number => {
    if (by === "views") return num(row.views);
    if (by === "people") return num(row.reach);
    if (by === "talked") return interactions(row);
    return 0;
  };

  return [...rows].sort((a, b) => (by === "recent" ? newest(a, b) : score(b) - score(a) || newest(a, b)));
}

/** What record_share and share_breakdown call this kind of thing. */
export function shareTarget(kind: string): "post" | "shot" {
  return kind === "shot" ? "shot" : "post";
}

/** The share destinations, in the order they are worth reading. */
export const SHARE_DESTINATIONS: { key: string; label: string }[] = [
  { key: "dm", label: "Sent in a chat" },
  { key: "show", label: "Put in a Show" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "native", label: "Shared elsewhere" },
  { key: "copy", label: "Link copied" },
  { key: "other", label: "Other" },
];

/**
 * A watch time in words.
 *
 * Milliseconds, because that is what shot_watch_stats stores, and hours
 * because a Shot that has been watched a thousand times has been watched
 * for hours and "3600000 ms" is not an answer.
 */
export function watchTime(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total}s`;
  const mins = Math.floor(total / 60);
  if (mins < 60) return `${mins}m ${total % 60}s`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}
