import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { PeopleList, type PersonRow } from "@/components/profile/PeopleList";

/**
 * Followers and following, on a route.
 *
 * These were one bottom sheet capped at .limit(100) with no pagination, no
 * search and no total — so anyone past a hundred followers had a silently
 * truncated list. Worse for the flow: tapping a row called onClose(), which
 * destroyed the list, so going back meant navigating to the profile again and
 * re-tapping the counter.
 *
 * One route serves both, because they are the same list read from opposite
 * ends of the same table.
 */
export const dynamic = "force-dynamic";

const PAGE = 60;

export default async function FollowListPage({
  params,
}: {
  params: Promise<{ username: string; list: string }>;
}) {
  const { username, list } = await params;
  if (list !== "followers" && list !== "following") notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, username, is_private")
    .eq("username", username)
    .maybeSingle();
  if (!profile) notFound();

  const isOwn = profile.id === user.id;

  // A private account's connections are as private as its posts. Anyone who
  // does not follow them sees the same lock the profile shows.
  let locked = false;
  if (profile.is_private && !isOwn) {
    const { data: follow } = await supabase
      .from("follows")
      .select("follower_id")
      .eq("follower_id", user.id)
      .eq("following_id", profile.id)
      .maybeSingle();
    locked = !follow;
  }

  const joinCol = list === "followers" ? "follower_id" : "following_id";
  const matchCol = list === "followers" ? "following_id" : "follower_id";

  const [{ data, count }, { data: mine }] = await Promise.all([
    locked
      ? Promise.resolve({ data: [], count: 0 })
      : supabase
          .from("follows")
          .select(
            `created_at, profile:profiles!${joinCol}(id, display_name, username, avatar_hue, avatar_url)`,
            { count: "exact" }
          )
          .eq(matchCol, profile.id)
          .order("created_at", { ascending: false })
          .limit(PAGE),
    supabase.from("follows").select("following_id").eq("follower_id", user.id).limit(2000),
  ]);

  const rows: PersonRow[] = (data ?? []).flatMap((r: Record<string, unknown>) => {
    const p = Array.isArray(r.profile) ? r.profile[0] : r.profile;
    if (!p) return [];
    const prof = p as Record<string, unknown>;
    return [
      {
        id: prof.id as string,
        name: (prof.display_name as string) ?? (prof.username as string) ?? "User",
        username: (prof.username as string) ?? null,
        hue: (prof.avatar_hue as number) ?? 280,
        avatarUrl: (prof.avatar_url as string) ?? null,
        at: r.created_at as string,
      },
    ];
  });

  const iFollow = new Set(
    (mine ?? []).map((m: { following_id: string }) => m.following_id)
  );

  return (
    <>
      <PageHeader
        title={list === "followers" ? "Followers" : "Following"}
        showBack
      />
      <PeopleList
        ownerId={profile.id}
        list={list}
        initial={rows}
        total={count ?? rows.length}
        iFollowIds={[...iFollow]}
        currentUserId={user.id}
        locked={locked}
        lockedName={(profile.display_name as string) ?? username}
        pageSize={PAGE}
      />
    </>
  );
}
