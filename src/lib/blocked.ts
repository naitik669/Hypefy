import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Ids of everyone the current user has blocked (RLS scopes blocked_users
 * to the blocker's own rows). Feeds/search/comments exclude these authors;
 * DM + call guards are already enforced server-side.
 */
export async function getBlockedIds(supabase: SupabaseClient): Promise<Set<string>> {
  const { data } = await supabase.from("blocked_users").select("blocked_id");
  return new Set(((data ?? []) as { blocked_id: string | null }[])
    .map((r) => r.blocked_id)
    .filter((id): id is string => !!id));
}
