import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { ConversationMedia, type SharedPerson } from "@/components/messages/ConversationMedia";
import { SHARED_KINDS, SHARED_SELECT, isSharedTab, sortShared, type SharedRow } from "@/lib/chat-shared";

/** How far back each list reaches. Enough for a long chat; older things are still in the thread. */
const MEDIA_LIMIT = 300;
const LINK_LIMIT = 100;

/**
 * Everything shared in one conversation: photos and videos, posts and Shots,
 * and voice notes, files and links.
 *
 * Membership is enforced by RLS on `messages`, so a non-member's query simply
 * returns nothing — but the explicit check below turns that into a 404 rather
 * than an empty gallery, which would read as "nothing was shared".
 */
export default async function ConversationMediaPage({
  params,
  searchParams,
}: {
  params: Promise<{ threadId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { threadId } = await params;
  const { tab } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const [{ data: members }, { data: conv }, { data: rows }, { data: linkRows }] = await Promise.all([
    supabase
      .from("conversation_members")
      .select("user_id, profiles(id, display_name, username, avatar_hue, avatar_url)")
      .eq("conversation_id", threadId),
    supabase.from("conversations").select("type").eq("id", threadId).maybeSingle(),
    supabase
      .from("messages")
      .select(SHARED_SELECT)
      .eq("conversation_id", threadId)
      .in("kind", SHARED_KINDS)
      .eq("is_unsent", false)
      .order("created_at", { ascending: false })
      .limit(MEDIA_LIMIT),
    // Links live inside ordinary messages, so they are asked for by what they contain.
    supabase
      .from("messages")
      .select("id, kind, body, sender_id, created_at")
      .eq("conversation_id", threadId)
      .eq("kind", "text")
      .eq("is_unsent", false)
      .ilike("body", "%http%")
      .order("created_at", { ascending: false })
      .limit(LINK_LIMIT),
  ]);

  if (!members?.some((m) => m.user_id === user.id)) notFound();

  const people: Record<string, SharedPerson> = {};
  for (const m of members) {
    const p = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as {
      display_name: string | null;
      username: string | null;
      avatar_hue: number | null;
      avatar_url: string | null;
    } | null;
    people[m.user_id] = {
      name: p?.display_name ?? p?.username ?? "User",
      hue: p?.avatar_hue ?? 280,
      avatarUrl: p?.avatar_url ?? null,
    };
  }

  const all = [...((rows ?? []) as unknown as SharedRow[]), ...((linkRows ?? []) as unknown as SharedRow[])].sort((a, b) =>
    a.created_at < b.created_at ? 1 : -1,
  );

  return (
    <>
      <PageHeader title="Shared" showBack />
      <ConversationMedia
        shared={sortShared(all)}
        me={user.id}
        people={people}
        isGroup={conv?.type === "group"}
        initialTab={isSharedTab(tab) ? tab : "media"}
      />
    </>
  );
}
