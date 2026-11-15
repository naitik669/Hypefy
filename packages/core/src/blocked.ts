import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Everyone you should not see, and who should not see you.
 *
 * Blocking used to be one-directional in the read path. `blocked_users` has a
 * single RLS policy — `blocker_id = auth.uid()` — so a direct query can only
 * ever return people YOU blocked. Someone who blocked you stayed fully visible
 * in your feed, search and discover, which is not what either party expects
 * from a block: the person who blocked you was still on your screen, and you
 * were still one tap from their profile.
 *
 * The reverse direction is unreadable by design, so it needs the SECURITY
 * DEFINER `blocked_either_way()` (migration 0047), which returns the other
 * party's id from rows in both directions.
 *
 * Deliberately NOT capped, unlike the other list queries in the feed path. A
 * truncated block list does not degrade — it silently shows you someone you
 * blocked. When the failure mode of "too many rows" is a slow query and the
 * failure mode of "too few" is a safety incident, unbounded is the correct
 * direction to err in. Block lists are small in practice; if that ever stops
 * being true the fix is to filter server-side, not to take the first N.
 */
export async function getBlockedIds(
  supabase: SupabaseClient
): Promise<Set<string>> {
  const { data, error } = await supabase.rpc("blocked_either_way");

  if (error) {
    // Fall back to the one-directional read rather than returning an empty set.
    // An empty set means "block nobody", which on this path shows blocked
    // people to each other — the one outcome worth an extra round trip to
    // avoid.
    const { data: own } = await supabase
      .from("blocked_users")
      .select("blocked_id");
    return new Set(
      ((own ?? []) as { blocked_id: string | null }[])
        .map((r) => r.blocked_id)
        .filter((id): id is string => !!id)
    );
  }

  return new Set(
    ((data ?? []) as (string | null)[]).filter((id): id is string => !!id)
  );
}
