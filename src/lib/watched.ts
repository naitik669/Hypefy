import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Recording that a Shot was actually watched, and forgetting what was.
 *
 * The same three limits the feed's own impression keeps (see FeedImpression):
 * on screen for a beat rather than merely mounted, once per Shot per session
 * held in memory, and once per Shot per person per day in the database,
 * enforced by the primary key. Failures are swallowed: this sits behind every
 * reel and must never produce a toast or block anything.
 */

/** How long a Shot has to be the one on screen before it counts as watched. */
export const WATCH_MS = 1200;

/** Survives a reel unmounting and coming back; cleared on reload. */
const recorded = new Set<string>();

/** For tests, and for a sign-out that should not leave the last session behind. */
export function forgetRecordedWatches(): void {
  recorded.clear();
}

/** Has this Shot already been counted this session? */
export function alreadyRecorded(shotId: string): boolean {
  return recorded.has(shotId);
}

type Db = Pick<SupabaseClient, "from">;

/**
 * Note that this person watched this Shot. Does nothing without a viewer,
 * for a Shot already counted this session, or if the write fails.
 */
export async function recordWatch(supabase: Db, shotId: string, viewerId: string | null | undefined): Promise<void> {
  if (!shotId || !viewerId || recorded.has(shotId)) return;
  recorded.add(shotId);
  try {
    await supabase.from("shot_views").insert({ shot_id: shotId, viewer_id: viewerId });
  } catch {
    /* a duplicate for today is the expected case, not an error */
  }
}

export type ForgetKind = "post" | "shot" | "all";

/** Clear your watch history. Returns how many were forgotten, or null if it failed. */
export async function forgetViews(supabase: SupabaseClient, kind: ForgetKind): Promise<number | null> {
  const { data, error } = await supabase.rpc("forget_views", { p_kind: kind });
  return error ? null : typeof data === "number" ? data : 0;
}

/** Forget one thing you watched. Returns true if it worked. */
export async function forgetOneView(
  supabase: SupabaseClient,
  kind: "post" | "shot",
  id: string,
): Promise<boolean> {
  const { error } = await supabase.rpc("forget_one_view", { p_kind: kind, p_id: id });
  return !error;
}
