import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RealChatView } from "@/components/messages/RealChatView";
import { one } from "@/lib/supabase/typed";
import { visibleBubbleStyle } from "@/lib/bubble-styles";

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  const supabase = await createClient();

  // Everything the chat needs, in one round of requests rather than three in
  // a row. The inbox stays on screen until this page is ready (there is no
  // loading.tsx; see layout.tsx), so this wait is the whole wait to open a
  // chat. RLS limits every query to the reader's own conversations, so
  // fetching before the user check exposes nothing.
  const [
    { data: { user } },
    { data: members },
    { data: conv },
    { data: latestMsgs },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("conversation_members")
      .select("user_id, role, last_read_at, profiles(id, display_name, username, avatar_hue, avatar_url, last_seen_at, show_activity, hide_read_receipts, is_verified, is_premium, name_font, name_glow, avatar_decoration, bubble_style)")
      .eq("conversation_id", threadId),
    supabase.from("conversations").select("type, title, avatar_url, theme").eq("id", threadId).maybeSingle(),
    // Latest 30 messages with post + shot previews and their reactions
    // (newest-first for the limit, reversed to chronological below).
    supabase
      .from("messages")
      .select("id, body, sender_id, kind, post_id, shot_id, reply_to_id, is_unsent, metadata, created_at, post:posts(id, caption, image_url, image_urls, profiles!posts_user_id_fkey(username, display_name, avatar_hue)), shot:shots(id, media_url, caption, profiles(username, display_name, avatar_hue)), reactions:message_reactions(message_id, user_id, emoji)")
      .eq("conversation_id", threadId)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);
  if (!user) redirect("/signin");

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

  const rawMsgs = (latestMsgs ?? []).slice().reverse();

  const profOf = (x: any) => { const p = one<any>(x); return p ? one<any>(p.profiles) : null; };

  const messages = (rawMsgs ?? []).map((m: any) => ({
    ...m,
    reactions: undefined,
    post: m.post ? { ...one(m.post), profiles: undefined } : null,
    postProfile: m.post ? profOf(m.post) : null,
    shot: m.shot ? { ...one(m.shot), profiles: undefined } : null,
    shotProfile: m.shot ? profOf(m.shot) : null,
  }));

  // Reactions came embedded with their messages.
  const reactRows = (rawMsgs ?? []).flatMap((m: any) => m.reactions ?? []);

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

  // Everyone's own bubble style, including yours, as they can show it now.
  const bubbleStyles: Record<string, string | null> = {};
  for (const m of members) {
    const p = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as { bubble_style?: string | null; is_premium?: boolean | null } | null;
    if (p) bubbleStyles[m.user_id] = visibleBubbleStyle(p);
  }

  // The other person's badge and Premium styling, for the chat header.
  const opStyle = op as {
    is_verified?: boolean | null;
    is_premium?: boolean | null;
    name_font?: string | null;
    name_glow?: string | null;
    avatar_decoration?: string | null;
  } | null;

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
        verified: !!opStyle?.is_verified,
        cosmetics: opStyle
          ? { is_premium: opStyle.is_premium ?? false, name_font: opStyle.name_font ?? null, name_glow: opStyle.name_glow ?? null, avatar_decoration: opStyle.avatar_decoration ?? null }
          : null,
      }}
      group={group}
      members={membersMap}
      initialMessages={messages}
      initialReactions={(reactRows ?? []) as any}
      initialReaders={readers}
      bubbleStyles={bubbleStyles}
      initialTheme={(conv as { theme?: string | null } | null)?.theme ?? null}
    />
  );
}
