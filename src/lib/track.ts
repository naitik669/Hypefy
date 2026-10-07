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

/**
 * Original audio: a Shot's own sound, as a song.
 *
 * A Shot made without a song still has a sound, the one it was filmed with.
 * Treating that as a song of its own, whose audio is the Shot's file, is all
 * it takes for it to have a page and be used by someone else: everything
 * that plays, names or looks up a song already works on this shape.
 */
const ORIGINAL_PREFIX = "original-";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** The song id that stands for one Shot's own audio. */
export function originalSoundId(shotId: string): string {
  return `${ORIGINAL_PREFIX}${shotId}`;
}

/** The Shot an original-audio id points at, or null if it is some other song. */
export function originalShotId(trackId: string): string | null {
  if (!trackId.startsWith(ORIGINAL_PREFIX)) return null;
  const id = trackId.slice(ORIGINAL_PREFIX.length);
  return UUID.test(id) ? id : null;
}

export const ORIGINAL_TITLE = "Original audio";

/** A Shot's own audio, in the shape of a song. */
export function originalTrackFor(shot: {
  id: string;
  media_url: string;
  poster_url?: string | null;
  trim_start?: number | null;
  profiles?: { username?: string | null; display_name?: string | null; avatar_url?: string | null } | null;
}): Track {
  const who = shot.profiles?.username ? `@${shot.profiles.username}` : (shot.profiles?.display_name ?? "");
  const start = Number(shot.trim_start);
  return {
    id: originalSoundId(shot.id),
    title: ORIGINAL_TITLE,
    artist: who,
    // The person, not the frame: an original sound is somebody's.
    artwork: shot.profiles?.avatar_url ?? shot.poster_url ?? "",
    preview: shot.media_url,
    ...(Number.isFinite(start) && start > 0 ? { start } : {}),
  };
}
