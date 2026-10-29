import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { GoneScreen } from "@/components/empty/GoneScreen";
import { CollabView, type CollabPerson, type CollabShow } from "@/components/shows/CollabView";

/**
 * One shared Show.
 *
 * Everything here is fetched through RLS rather than filtered after:
 * the collab policy only returns one you are in or were asked into,
 * and the Shows come back through can_see_show, which since 0186 lets
 * a joined member see what was posted into it even where the ordinary
 * way in would not. A non-member gets the same "off air" screen a
 * missing Show gets, which is the correct answer to both "this does
 * not exist" and "this is not yours" — they are the same answer.
 */
export default async function CollabPage({
  params,
}: {
  params: Promise<{ collabId: string }>;
}) {
  const { collabId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { data: collab } = await supabase
    .from("show_collabs")
    .select("id, title, owner_id")
    .eq("id", collabId)
    .maybeSingle();

  if (!collab) return <GoneScreen kind="show" />;

  const [membersRes, showsRes, followingRes] = await Promise.all([
    supabase
      .from("show_collab_members")
      .select(
        "user_id, joined_at, profile:profiles!show_collab_members_user_id_fkey(id, display_name, username, avatar_hue, avatar_url)",
      )
      .eq("collab_id", collabId),
    supabase
      .from("shows")
      .select("id, media_url, caption, user_id, expires_at")
      .eq("collab_id", collabId)
      .order("created_at", { ascending: false })
      .limit(60),
    supabase
      .from("follows")
      .select(
        "profile:profiles!follows_following_id_fkey(id, display_name, username, avatar_hue, avatar_url)",
      )
      .eq("follower_id", user.id)
      .limit(300),
  ]);

  const person = (raw: unknown, joined: boolean): CollabPerson | null => {
    const p = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | null;
    if (!p?.id) return null;
    return {
      id: p.id as string,
      name: (p.display_name as string) ?? (p.username as string) ?? "User",
      username: (p.username as string) ?? null,
      hue: (p.avatar_hue as number) ?? 280,
      avatarUrl: (p.avatar_url as string) ?? null,
      joined,
    };
  };

  const people = (membersRes.data ?? []).flatMap((m) => {
    const found = person(m.profile, m.joined_at != null);
    return found ? [found] : [];
  });

  const candidates = (followingRes.data ?? []).flatMap((f) => {
    const found = person(f.profile, false);
    return found ? [found] : [];
  });

  return (
    <>
      <PageHeader title="Shared Show" showBack />
      <CollabView
        collabId={collab.id}
        title={collab.title}
        ownerId={collab.owner_id}
        people={people}
        shows={(showsRes.data ?? []) as CollabShow[]}
        viewerId={user.id}
        candidates={candidates}
      />
    </>
  );
}
