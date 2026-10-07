/**
 * A song, as Hypefy saves it on a note, post, Shot, Show or profile.
 *
 * Kept apart from lib/music on purpose: that file plays songs and is
 * client-only, while this is only the shape and its parser, which server
 * pages need as well.
 */

/** A song attached to a note/post/show/profile — shaped by /api/music. */
export type Track = {
  id: string;
  title: string;
  artist: string;
  artwork: string;
  /** 30s mp3. Empty for Spotify tracks — Spotify stopped serving previews to
   *  newly-created apps, so those play through `uri` and the Playback SDK. */
  preview: string;
  /** `spotify:track:…` — full-length playback via the Web Playback SDK. */
  uri?: string;
  /** Real track length in ms, so a snippet timeline can span the whole song
   *  instead of a 30s preview. */
  durationMs?: number;
  /** Seconds into the track to start from (snippet selection). */
  start?: number;
  /** "Listen on" link — Apple Music or Spotify, depending on the source. */
  appleUrl?: string;
};

/**
 * Parse a track jsonb column defensively — bad shapes become null.
 *
 * Playable means a preview OR a Spotify uri: rows written before the switch
 * have only the former, rows written after only the latter, and both have to
 * keep working in the same feed.
 */
export function parseTrack(raw: unknown): Track | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  if (!t.id || !t.title || !(t.preview || t.uri)) return null;
  const start = Number(t.start);
  const durationMs = Number(t.durationMs);
  return {
    id: String(t.id),
    title: String(t.title),
    artist: String(t.artist ?? ""),
    artwork: String(t.artwork ?? ""),
    preview: String(t.preview ?? ""),
    ...(t.uri ? { uri: String(t.uri) } : {}),
    ...(Number.isFinite(durationMs) && durationMs > 0 ? { durationMs } : {}),
    ...(Number.isFinite(start) && start > 0 ? { start } : {}),
    ...(t.appleUrl ? { appleUrl: String(t.appleUrl) } : {}),
  };
}
