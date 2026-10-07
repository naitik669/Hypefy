import type { SupabaseClient } from "@supabase/supabase-js";
import { parseTrack, type Track } from "@/lib/track";

/**
 * Everything on Hypefy made with one song.
 *
 * A song is not a row of its own. It is saved, whole, on each Shot and post
 * that uses it, so "the song" is whatever those rows agree on, and its page
 * is a search for them by the song's id. Row security decides what the
 * person asking may see, exactly as it does in a feed: a private account's
 * Shot counts for its followers and for nobody else.
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

export async function findSound(supabase: Db, rawId: string): Promise<Sound | null> {
  const id = cleanSoundId(rawId);
  if (!id) return null;

  const [shots, posts] = await Promise.all([
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
  ]);

  const shotRows = (shots.data ?? []) as (SoundShot & { track: unknown })[];
  const postRows = (posts.data ?? []) as (SoundPost & { track: unknown })[];

  // The newest use speaks for the song. Its snippet start is somebody's
  // choice for their own Shot, not part of the song, so it is left behind.
  const first = [...shotRows, ...postRows].map((r) => parseTrack(r.track)).find(Boolean);
  if (!first) return null;
  const { start: _start, ...track } = first;
  void _start;

  return {
    track,
    shots: shotRows.map(({ track: _t, ...s }) => (void _t, s)),
    posts: postRows.map(({ track: _t, ...p }) => (void _t, p)),
    shotCount: shots.count ?? shotRows.length,
    postCount: posts.count ?? postRows.length,
  };
}

/** "3 Shots · 1 post", leaving out whichever there are none of. */
export function soundCountLine(shotCount: number, postCount: number): string {
  const parts: string[] = [];
  if (shotCount > 0) parts.push(`${shotCount} ${shotCount === 1 ? "Shot" : "Shots"}`);
  if (postCount > 0) parts.push(`${postCount} ${postCount === 1 ? "post" : "posts"}`);
  return parts.join(" · ");
}
