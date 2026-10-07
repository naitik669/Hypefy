import type { SupabaseClient } from "@supabase/supabase-js";
import { parseTrack, type Track } from "@/lib/track";

/**
 * Sounds you kept, and sounds being used: what the song picker offers
 * before you have typed anything, and what a sound's Save button writes.
 * See 0127.
 */

type Db = Pick<SupabaseClient, "from" | "rpc">;

export type SoundShelf = { saved: Track[]; trending: Track[] };
export const EMPTY_SHELF: SoundShelf = { saved: [], trending: [] };

/** How many of each the picker lists. */
export const SHELF_SAVED = 30;
export const SHELF_TRENDING = 12;

function tracks(rows: unknown, key: string): Track[] {
  if (!Array.isArray(rows)) return [];
  const seen = new Set<string>();
  return rows.flatMap((r) => {
    const t = parseTrack((r as Record<string, unknown> | null)?.[key]);
    if (!t || seen.has(t.id)) return [];
    seen.add(t.id);
    return [t];
  });
}

/**
 * The picker's shelf. Either half failing leaves that half empty; the picker
 * still searches.
 */
export async function loadSoundShelf(supabase: Db, userId: string | null): Promise<SoundShelf> {
  const [saved, trending] = await Promise.all([
    userId
      ? supabase
          .from("saved_sounds")
          .select("track")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(SHELF_SAVED)
      : Promise.resolve({ data: [] }),
    supabase.rpc("trending_sounds", { p_limit: SHELF_TRENDING }),
  ]);
  const mine = tracks(saved.data, "track");
  const kept = new Set(mine.map((t) => t.id));
  return {
    saved: mine,
    // Something already on your shelf is not news.
    trending: tracks(trending.data, "track").filter((t) => !kept.has(t.id)),
  };
}

export async function isSoundSaved(supabase: Db, userId: string, trackId: string): Promise<boolean> {
  const { data } = await supabase
    .from("saved_sounds")
    .select("track_id")
    .eq("user_id", userId)
    .eq("track_id", trackId)
    .maybeSingle();
  return !!data;
}

/** Keep a sound. The snippet start is left out: it was one Shot's choice. */
export async function saveSound(supabase: Db, userId: string, track: Track): Promise<boolean> {
  const { start: _start, ...kept } = track;
  void _start;
  const { error } = await supabase
    .from("saved_sounds")
    .upsert({ user_id: userId, track_id: track.id, track: kept }, { onConflict: "user_id,track_id" });
  return !error;
}

export async function unsaveSound(supabase: Db, userId: string, trackId: string): Promise<boolean> {
  const { error } = await supabase.from("saved_sounds").delete().eq("user_id", userId).eq("track_id", trackId);
  return !error;
}
