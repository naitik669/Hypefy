import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * What an author can do to their own post or Shot after posting it:
 * archive it, and stop new comments on it.
 *
 * Both go through SECURITY DEFINER functions (migration 0131) rather than a
 * direct update, because the columns behind them are not writable by the
 * client — the same lock that stops anyone setting their own hype count or
 * undoing an admin's removal.
 */

export type PostKind = "post" | "shot";

/** One archived post or Shot, as my_archive() hands it back. */
export type ArchivedItem = {
  kind: PostKind;
  id: string;
  caption: string | null;
  /** The picture to show: a post's first image, or a Shot's poster. */
  thumb: string | null;
  /** A Shot with no poster shows its own first frame instead. */
  media_url: string | null;
  archived_at: string;
};

/** Read rows from my_archive() without trusting their shape. */
export function parseArchive(raw: unknown): ArchivedItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const r = row as Record<string, unknown>;
    if ((r.kind !== "post" && r.kind !== "shot") || typeof r.id !== "string") return [];
    return [
      {
        kind: r.kind,
        id: r.id,
        caption: typeof r.caption === "string" ? r.caption : null,
        thumb: typeof r.thumb === "string" ? r.thumb : null,
        media_url: typeof r.media_url === "string" ? r.media_url : null,
        archived_at: typeof r.archived_at === "string" ? r.archived_at : "",
      },
    ];
  });
}

/** What the author is told when the server refuses. */
const SORRY = {
  archive: "Couldn't archive that. Try again.",
  unarchive: "Couldn't put that back. Try again.",
  comments: "Couldn't change comments for that. Try again.",
} as const;

/** Archive one of your own, or put it back. Returns null, or what went wrong. */
export async function setArchived(
  supabase: SupabaseClient,
  kind: PostKind,
  id: string,
  archived: boolean,
): Promise<string | null> {
  const { error } = await supabase.rpc("set_archived", { p_kind: kind, p_id: id, p_archived: archived });
  return error ? (archived ? SORRY.archive : SORRY.unarchive) : null;
}

/** Turn comments off, or back on. Returns null, or what went wrong. */
export async function setCommentsOff(
  supabase: SupabaseClient,
  kind: PostKind,
  id: string,
  off: boolean,
): Promise<string | null> {
  const { error } = await supabase.rpc("set_comments_off", { p_kind: kind, p_id: id, p_off: off });
  return error ? SORRY.comments : null;
}

/** Everything the signed-in person has archived, newest first. */
export async function loadArchive(supabase: SupabaseClient): Promise<ArchivedItem[]> {
  const { data, error } = await supabase.rpc("my_archive");
  return error ? [] : parseArchive(data);
}

/**
 * Has a comment been changed since it was written?
 *
 * The database stamps the time on any change to the words, so this is the
 * stamp against the moment it was first posted. A second of slack covers a
 * row whose two times were written by the same statement.
 */
export function wasEdited(createdAt: string, updatedAt: string | null | undefined): boolean {
  if (!updatedAt) return false;
  const a = new Date(createdAt).getTime();
  const b = new Date(updatedAt).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return b - a > 1000;
}
