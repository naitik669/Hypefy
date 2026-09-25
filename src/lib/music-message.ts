import type { Track } from "@/lib/music";

/**
 * A song sent in a chat.
 *
 * The track rides in the message body as JSON, the way documents and voice
 * notes already do, so sending music needs no new column and no migration —
 * only a new `kind`.
 *
 * Only the fields a chat bubble actually plays and draws are kept: a whole
 * search result carries more than that, and a message body is not the place
 * to store it.
 */
export type MusicBody = Pick<Track, "id" | "title" | "artist" | "artwork" | "preview"> &
  Partial<Pick<Track, "uri" | "durationMs" | "start">>;

export function packTrack(t: Track): string {
  const body: MusicBody = {
    id: t.id,
    title: t.title,
    artist: t.artist,
    artwork: t.artwork,
    preview: t.preview,
    ...(t.uri ? { uri: t.uri } : {}),
    ...(t.durationMs ? { durationMs: t.durationMs } : {}),
    ...(t.start ? { start: t.start } : {}),
  };
  return JSON.stringify(body);
}

/**
 * The track back out of a message, or null when the body is not one — an old
 * client, a hand-made row, or a message whose kind says music and whose body
 * says something else. A bubble that gets null falls back to plain text.
 */
export function unpackTrack(body: string | null | undefined): Track | null {
  if (!body) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  if (typeof t.id !== "string" || !t.id) return null;
  if (typeof t.title !== "string" || !t.title) return null;
  return {
    id: t.id,
    title: t.title,
    artist: typeof t.artist === "string" ? t.artist : "",
    artwork: typeof t.artwork === "string" ? t.artwork : "",
    preview: typeof t.preview === "string" ? t.preview : "",
    ...(typeof t.uri === "string" ? { uri: t.uri } : {}),
    ...(typeof t.durationMs === "number" ? { durationMs: t.durationMs } : {}),
    ...(typeof t.start === "number" ? { start: t.start } : {}),
  };
}

/** What a chat list or a reply quote shows instead of the raw JSON. */
export function musicSnippet(body: string | null | undefined): string {
  const t = unpackTrack(body);
  if (!t) return "Song";
  return t.artist ? `${t.title} · ${t.artist}` : t.title;
}
