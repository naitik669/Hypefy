/**
 * A storage object name nobody can guess.
 *
 * Chat media and voice notes were stored at `<uid>/<Date.now()>.<ext>`.
 * The uid is public and the timestamp is a millisecond in a window a
 * stranger can often narrow to a minute, so the whole path was a short
 * search — and the read policy only ever asked whether a message the
 * caller could see contained that path, not who the file belonged to.
 * 0150 tightened the policy; this removes the thing it was defending.
 *
 * Only new uploads change. Existing objects keep their names and keep
 * working: nothing in the app parses a path apart from taking the folder,
 * which is still the uid.
 *
 * `crypto.randomUUID` is in every browser Hypefy supports and in the
 * WebView, and it is the same source Supabase uses for row ids.
 */
export function randomObjectName(userId: string, ext: string): string {
  const safe = ext.replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase() || "bin";
  return `${userId}/${crypto.randomUUID()}.${safe}`;
}

/**
 * The same, for one item of a set uploaded together.
 *
 * An album's parts used to share a timestamp and differ only by index, so
 * guessing one gave you the rest for free. Each gets its own id instead;
 * the index stays only so the order is readable while debugging.
 */
export function randomAlbumItemName(userId: string, index: number, ext: string): string {
  const safe = ext.replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase() || "bin";
  return `${userId}/${crypto.randomUUID()}-${index}.${safe}`;
}
