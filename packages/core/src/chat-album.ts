/**
 * Several photos and videos sent together as one chat message — the folder.
 *
 * Kept in `messages.body` as JSON, the way voice notes and documents already
 * pack their details (messages.kind has no CHECK constraint), so an album
 * needs no schema change: kind "album", body { caption, items }.
 */

export type AlbumItem = { url: string; type: "image" | "video" };
export type Album = { caption: string; items: AlbumItem[] };

/** The caption names the folder, so it stays short. */
export const ALBUM_CAPTION_MAX = 40;
/** Show the remaining count once the caption gets this close to the limit. */
export const ALBUM_CAPTION_WARN = 30;
/** One folder holds at most this many items. */
export const ALBUM_MAX_ITEMS = 10;

export function encodeAlbum(album: Album): string {
  return JSON.stringify({
    caption: album.caption.trim().slice(0, ALBUM_CAPTION_MAX),
    items: album.items.slice(0, ALBUM_MAX_ITEMS).map(({ url, type }) => ({ url, type })),
  });
}

/** Reads an album body, or null when it isn't one. Never throws. */
export function parseAlbum(body: string | null | undefined): Album | null {
  if (!body) return null;
  try {
    const raw = JSON.parse(body) as { caption?: unknown; items?: unknown };
    if (!Array.isArray(raw.items)) return null;
    const items = raw.items
      .filter(
        (i): i is AlbumItem =>
          !!i && typeof i.url === "string" && (i.type === "image" || i.type === "video"),
      )
      .map(({ url, type }) => ({ url, type }));
    if (items.length === 0) return null;
    return { caption: typeof raw.caption === "string" ? raw.caption : "", items };
  } catch {
    return null;
  }
}

/** "5 photos · 1 video", "2 videos", "3 photos". */
export function albumCount(items: AlbumItem[]): string {
  const videos = items.filter((i) => i.type === "video").length;
  const photos = items.length - videos;
  const part = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  return [photos && part(photos, "photo"), videos && part(videos, "video")]
    .filter(Boolean)
    .join(" · ");
}

/** What a quote or the inbox shows for an album. */
export function albumSnippet(body: string | null | undefined): string {
  const album = parseAlbum(body);
  if (!album) return "Photos";
  return album.caption || albumCount(album.items);
}
