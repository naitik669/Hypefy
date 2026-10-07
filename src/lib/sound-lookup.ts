import type { SupabaseClient } from "@supabase/supabase-js";
import { originalShotId, originalTrackFor, parseTrack, type Track } from "@/lib/track";

/**
 * Everything on Hypefy made with one sound.
 *
 * A sound is not a row of its own. A song is saved, whole, on each Shot and
 * post that uses it, so "the song" is whatever those rows agree on, and its
 * page is a search for them by the song's id. Row security decides what the
 * person asking may see, exactly as it does in a feed: a private account's
 * Shot counts for its followers and for nobody else.
 *
 * Original audio is the same thing with one difference: the sound belongs to
 * a Shot, its id says which, and that Shot heads its own page.
 */

export type SoundShot = {
  id: string;
  user_id: string;
  media_url: string;
  poster_url: string | null;
  caption: string | null;
};

export type SoundPost = {
  id: string;
  user_id: string;
  image_url: string | null;
  image_urls: string[] | null;
  caption: string | null;
  body: string | null;
};

export type Sound = {
  track: Track;
  shots: SoundShot[];
  posts: SoundPost[];
  shotCount: number;
  postCount: number;
  /**
   * May this sound be used for a new Shot? Always, for a song. For original
   * audio, only when its owner's account is public: using it copies their
   * sound onto someone else's Shot, where their followers-only setting no
   * longer covers it.
   */
  canUse: boolean;
  /** Set for original audio: whose it is. */
  original: { shotId: string; username: string | null } | null;
};

/** How many of each the page shows. The counts are of everything. */
export const SOUND_PAGE_SIZE = 60;

/** A song id comes from a link, so it is checked before it is searched for. */
export function cleanSoundId(raw: string): string | null {
  let id: string;
  try {
    id = decodeURIComponent(raw).trim();
  } catch {
    return null;
  }
  if (!id || id.length > 128 || /[\u0000-\u001f]/.test(id)) return null;
  return id;
}

type Db = Pick<SupabaseClient, "from">;

type SourceShot = SoundShot & {
  trim_start: number | null;
  profiles:
    | { username: string | null; display_name: string | null; avatar_url: string | null; is_private: boolean | null }
    | { username: string | null; display_name: string | null; avatar_url: string | null; is_private: boolean | null }[]
    | null;
};

export async function findSound(supabase: Db, rawId: string): Promise<Sound | null> {
  const id = cleanSoundId(rawId);
  if (!id) return null;
  const sourceId = originalShotId(id);

  const [shots, posts, source] = await Promise.all([
    supabase
      .from("shots")
      .select("id, user_id, media_url, poster_url, caption, track", { count: "exact" })
      .eq("track->>id", id)
      .is("removed_at", null)
      .order("created_at", { ascending: false })
      .limit(SOUND_PAGE_SIZE),
    supabase
      .from("posts")
      .select("id, user_id, image_url, image_urls, caption, body, track", { count: "exact" })
      .eq("track->>id", id)
      .is("removed_at", null)
      .order("created_at", { ascending: false })
      .limit(SOUND_PAGE_SIZE),
    // Original audio: the Shot it came from, if the person asking may see it.
    sourceId
      ? supabase
          .from("shots")
          .select(
            "id, user_id, media_url, poster_url, caption, trim_start, profiles(username, display_name, avatar_url, is_private)",
          )
          .eq("id", sourceId)
          .is("removed_at", null)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const shotRows = (shots.data ?? []) as (SoundShot & { track: unknown })[];
  const postRows = (posts.data ?? []) as (SoundPost & { track: unknown })[];
  const usedShots = shotRows.map(({ track: _t, ...s }) => (void _t, s));
  const usedPosts = postRows.map(({ track: _t, ...p }) => (void _t, p));
  const shotCount = shots.count ?? shotRows.length;
  const postCount = posts.count ?? postRows.length;

  const src = (source.data ?? null) as SourceShot | null;
  if (src) {
    const owner = Array.isArray(src.profiles) ? (src.profiles[0] ?? null) : src.profiles;
    const { trim_start, profiles: _p, ...first } = src;
    void _p;
    return {
      track: originalTrackFor({ ...first, trim_start, profiles: owner }),
      // The Shot the sound came from, then everything made with it since.
      shots: [first, ...usedShots],
      posts: usedPosts,
      shotCount: shotCount + 1,
      postCount,
      canUse: !owner?.is_private,
      original: { shotId: src.id, username: owner?.username ?? null },
    };
  }

  // A song; or original audio whose own Shot is gone or out of sight, in
  // which case whatever was made with it still speaks for it. The newest use
  // does. Its snippet start is somebody's choice for their own Shot, not
  // part of the song, so it is left behind.
  const first = [...shotRows, ...postRows].map((r) => parseTrack(r.track)).find(Boolean);
  if (!first) return null;
  const { start: _start, ...track } = first;
  void _start;

  return {
    track,
    shots: usedShots,
    posts: usedPosts,
    shotCount,
    postCount,
    // With its own Shot gone, the audio file may be gone too.
    canUse: !sourceId,
    original: null,
  };
}

/** "3 Shots · 1 post", leaving out whichever there are none of. */
export function soundCountLine(shotCount: number, postCount: number): string {
  const parts: string[] = [];
  if (shotCount > 0) parts.push(`${shotCount} ${shotCount === 1 ? "Shot" : "Shots"}`);
  if (postCount > 0) parts.push(`${postCount} ${postCount === 1 ? "post" : "posts"}`);
  return parts.join(" · ");
}
