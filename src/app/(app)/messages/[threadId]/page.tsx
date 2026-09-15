import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RealChatView } from "@/components/messages/RealChatView";
import { one } from "@/lib/supabase/typed";

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  // Membership + participants (RLS already blocks non-members)
  const [{ data: members }, { data: conv }] = await Promise.all([
    supabase
      .from("conversation_members")
      .select("user_id, role, last_read_at, profiles(id, display_name, username, avatar_hue, avatar_url, last_seen_at, show_activity, hide_read_receipts)")
      .eq("conversation_id", threadId),
    supabase.from("conversations").select("type, title, avatar_url, theme").eq("id", threadId).maybeSingle(),
  ]);

  if (!members || members.length === 0) notFound();
  const me = members.find((m: any) => m.user_id === user.id);
  if (!me) notFound();

  const isGroup = conv?.type === "group";

  const others = members
    .filter((m: any) => m.user_id !== user.id)
    .map((m: any) => (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles))
    .filter(Boolean);
  const op = others[0] ?? null;

  // Sender lookup + group meta
  const membersMap: Record<string, { name: string; hue: number }> = {};
  others.forEach((p: any) => {
    membersMap[p.id] = { name: p.display_name ?? p.username ?? "User", hue: p.avatar_hue ?? 280 };
  });
  const groupMembers = members
    .map((m: any) => {
      const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
      if (!p) return null;
      return {
        id: p.id,
        name: p.display_name ?? p.username ?? "User",
        username: p.username ?? null,
        hue: p.avatar_hue ?? 280,
        avatarUrl: p.avatar_url ?? null,
        role: (m.role ?? "member") as string,
      };
    })
    .filter(Boolean) as { id: string; name: string; username: string | null; hue: number; avatarUrl: string | null; role: string }[];

  const group = isGroup
    ? {
        title:
          conv?.title ||
          others.slice(0, 3).map((p: any) => p.display_name ?? p.username ?? "User").join(", ") +
            (others.length > 3 ? ` +${others.length - 3}` : ""),
        memberCount: members.length,
        avatarUrl: (conv as any)?.avatar_url ?? null,
        members: groupMembers,
        myRole: ((me as any).role ?? "member") as string,
      }
    : null;

  // Latest 30 messages with post + shot previews (newest-first for the limit,
  // then reversed to chronological order for rendering).
  const { data: latestMsgs } = await supabase
    .from("messages")
    .select("id, body, sender_id, kind, post_id, shot_id, reply_to_id, is_unsent, metadata, created_at, post:posts(id, caption, image_url, image_urls, profiles!posts_user_id_fkey(username, display_name, avatar_hue)), shot:shots(id, media_url, caption, profiles(username, display_name, avatar_hue))")
    .eq("conversation_id", threadId)
    .order("created_at", { ascending: false })
    .limit(30);
  const rawMsgs = (latestMsgs ?? []).slice().reverse();

  const profOf = (x: any) => { const p = one<any>(x); return p ? one<any>(p.profiles) : null; };

  const messages = (rawMsgs ?? []).map((m: any) => ({
    ...m,
    post: m.post ? { ...one(m.post), profiles: undefined } : null,
    postProfile: m.post ? profOf(m.post) : null,
    shot: m.shot ? { ...one(m.shot), profiles: undefined } : null,
    shotProfile: m.shot ? profOf(m.shot) : null,
  }));

  // Reactions for these messages
  const msgIds = messages.map((m: any) => m.id);
  const { data: reactRows } = msgIds.length
    ? await supabase.from("message_reactions").select("message_id, user_id, emoji").in("message_id", msgIds)
    : { data: [] as any[] };

  // Everyone else's read state — drives the "Seen" double-tick.
  //
  // Was a single scalar for the first other participant, fetched in its own
  // extra round trip. That is why groups never showed a read receipt: there is
  // no "the other person" in a group. The membership query above already has
  // every row, so this costs nothing and covers both shapes.
  const readers = members
    .filter((m: any) => m.user_id !== user.id)
    .map((m: any) => {
      const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
      return {
        userId: m.user_id as string,
        lastReadAt: (m.last_read_at as string | null) ?? null,
        hideReadReceipts: (p?.hide_read_receipts as boolean) ?? false,
      };
    });

  return (
    <RealChatView
      conversationId={threadId}
      currentUserId={user.id}
      other={{
        id: op?.id ?? "",
        name: op?.display_name ?? op?.username ?? "User",
        username: op?.username ?? null,
        hue: op?.avatar_hue ?? 280,
        avatarUrl: op?.avatar_url ?? null,
        lastSeenAt: (op as any)?.show_activity === false ? null : (op as any)?.last_seen_at ?? null,
        showActivity: (op as any)?.show_activity ?? true,
        hideReadReceipts: (op as any)?.hide_read_receipts ?? false,
      }}
      group={group}
      members={membersMap}
      initialMessages={messages}
      initialReactions={(reactRows ?? []) as any}
      initialReaders={readers}
      initialTheme={(conv as { theme?: string | null } | null)?.theme ?? null}
    />
  );
}
