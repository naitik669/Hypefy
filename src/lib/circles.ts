import type { SupabaseClient } from "@supabase/supabase-js";
import type { CirclePerson, CircleKind } from "@/components/profile/CircleList";

/**
 * Read your Hypers: the one private list of people, stored in close_friends.
 * (There were two lists; Favourites was folded into this one in 0111.)
 */
const SPEC_TABLE: Record<CircleKind, "close_friends"> = { hypers: "close_friends" };

export async function fetchCircle(
  // The generated Database type does not cover the dynamic table name here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  kind: CircleKind,
  userId: string
): Promise<CirclePerson[]> {
  const table = SPEC_TABLE[kind];
  const { data } = await supabase
    .from(table)
    .select(
      `created_at, profile:profiles!${table}_friend_id_fkey(id, display_name, username, avatar_hue, avatar_url)`
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(500);

  return (data ?? []).flatMap((r: Record<string, unknown>) => {
    const raw = r.profile as Record<string, unknown> | Record<string, unknown>[] | null;
    const p = Array.isArray(raw) ? raw[0] : raw;
    if (!p) return [];
    return [
      {
        id: p.id as string,
        name: (p.display_name as string) ?? (p.username as string) ?? "User",
        username: (p.username as string) ?? null,
        hue: (p.avatar_hue as number) ?? 280,
        avatarUrl: (p.avatar_url as string) ?? null,
      },
    ];
  });
}
