import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MessagesHeader } from "@/components/messages/MessagesHeader";
import { MessagesInbox, type InboxRow } from "@/components/messages/MessagesInbox";
import { PullToRefresh } from "@/components/ui/PullToRefresh";

export default async function MessagesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { data: me } = await supabase
    .from("profiles")
    .select("display_name, username, avatar_hue, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  // Conversations I'm a member of (RLS filters to mine), newest first
  const { data: convs } = await supabase
    .from("conversations")
    .select("id, last_message_at, type, title")
    .order("last_message_at", { ascending: false })
    .limit(50);

  const convIds = (convs ?? []).map((c: any) => c.id);

  let rows: InboxRow[] = [];
  if (convIds.length > 0) {
    const [membersRes, msgsRes, myMemberRes, reactionsRes] = await Promise.all([
      // The other participant in each conversation
      supabase
        .from("conversation_members")
        .select("conversation_id, user_id, profiles(id, display_name, username, avatar_hue, avatar_url, last_seen_at, show_activity)")
        .in("conversation_id", convIds)
        .neq("user_id", user.id),
      // Last message + unread count per conversation, aggregated in the DB.
      // This used to pull every message across all 50 conversations into the
      // app just to derive these two things.
      supabase.rpc("get_inbox_summary", { p_conversation_ids: convIds }),
      // My membership state per conversation (read + request + block)
      supabase
        .from("conversation_members")
        .select("conversation_id, last_read_at, request_accepted, blocked_at, muted_at, pinned_at")
        .in("conversation_id", convIds)
        .eq("user_id", user.id),
      // Recent reactions — when newer than the last message, they become the preview
      supabase
        .from("message_reactions")
        .select("emoji, user_id, created_at, messages!inner(conversation_id, sender_id)")
        .in("messages.conversation_id", convIds)
        .order("created_at", { ascending: false })
        .limit(80),
    ]);

    // Latest reaction per conversation
    const reactionByConv = new Map<string, { emoji: string; created_at: string; mine: boolean; onMine: boolean }>();
    (reactionsRes.data ?? []).forEach((r: any) => {
      const msg = Array.isArray(r.messages) ? r.messages[0] : r.messages;
      if (!msg || reactionByConv.has(msg.conversation_id)) return;
      reactionByConv.set(msg.conversation_id, {
        emoji: r.emoji,
        created_at: r.created_at,
        mine: r.user_id === user.id,
        onMine: msg.sender_id === user.id,
      });
    });

    // All other members per conversation (for groups we need everyone)
    const membersByConv = new Map<string, { id: string; name: string; username: string | null; hue: number; avatarUrl: string | null; online: boolean; lastSeenAt: string | null; showActivity: boolean }[]>();
    (membersRes.data ?? []).forEach((m: any) => {
      const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
      if (!p) return;
      const arr = membersByConv.get(m.conversation_id) ?? [];
      const showActivity = p.show_activity !== false;
      const online =
        showActivity &&
        !!p.last_seen_at &&
        Date.now() - new Date(p.last_seen_at).getTime() < 90_000;
      arr.push({ id: p.id, name: p.display_name ?? p.username ?? "User", username: p.username ?? null, hue: p.avatar_hue ?? 280, avatarUrl: p.avatar_url ?? null, online, lastSeenAt: showActivity ? (p.last_seen_at ?? null) : null, showActivity });
      membersByConv.set(m.conversation_id, arr);
    });

    // 24h status of each 1:1 peer — shown as a thought bubble on the inbox row
    // (block + audience gated by the RPC). Groups are skipped.
    const noteByUser = new Map<string, string>();
    const peerIds = (convs ?? [])
      .filter((c: any) => c.type !== "group")
      .map((c: any) => (membersByConv.get(c.id) ?? [])[0]?.id)
      .filter(Boolean) as string[];
    if (peerIds.length > 0) {
      const { data: peerNotes } = await supabase.rpc("get_notes_for", { p_user_ids: peerIds });
      (peerNotes ?? []).forEach((n: any) => noteByUser.set(n.user_id, n.text));
    }

    // One row per conversation from get_inbox_summary — already the newest
    // message, so no client-side "first wins" pass is needed.
    const lastByConv = new Map<string, any>();
    const unreadCountByConv = new Map<string, number>();
    (msgsRes.data ?? []).forEach((s: any) => {
      if (s.last_created_at) {
        lastByConv.set(s.conversation_id, {
          conversation_id: s.conversation_id,
          body: s.last_body,
          kind: s.last_kind,
          created_at: s.last_created_at,
          sender_id: s.last_sender_id,
        });
      }
      unreadCountByConv.set(s.conversation_id, s.unread_count ?? 0);
    });

    const readByConv = new Map<string, string | null>();
    const requestByConv = new Map<string, boolean>();
    const blockedByConv = new Set<string>();
    const mutedByConv = new Set<string>();
    const pinnedByConv = new Set<string>();
    (myMemberRes.data ?? []).forEach((m: any) => {
      readByConv.set(m.conversation_id, m.last_read_at);
      requestByConv.set(m.conversation_id, m.request_accepted !== false);
      if (m.blocked_at) blockedByConv.add(m.conversation_id);
      if (m.muted_at) mutedByConv.add(m.conversation_id);
      if (m.pinned_at) pinnedByConv.add(m.conversation_id);
    });

    rows = (convs ?? [])
      .filter((c: any) => !blockedByConv.has(c.id)) // hide conversations I've blocked
      .map((c: any) => {
        const members = membersByConv.get(c.id) ?? [];
        if (members.length === 0) return null;
        const isGroup = c.type === "group";
        const last = lastByConv.get(c.id);
        const lastRead = readByConv.get(c.id) ?? null;
        const unread =
          !!last &&
          last.sender_id !== user.id &&
          (!lastRead || new Date(last.created_at) > new Date(lastRead));

        const groupName =
          c.title ||
          members.slice(0, 3).map((m) => m.name).join(", ") +
            (members.length > 3 ? ` +${members.length - 3}` : "");
        const lastSenderName =
          isGroup && last && last.sender_id !== user.id
            ? members.find((m) => m.id === last.sender_id)?.name ?? null
            : null;

        return {
          id: c.id,
          name: isGroup ? groupName : members[0].name,
          username: isGroup ? null : members[0].username,
          hue: isGroup ? 210 : members[0].hue,
          avatarUrl: isGroup ? null : members[0].avatarUrl,
          isGroup,
          memberCount: members.length + 1,
          lastBody: last?.body ?? null,
          lastKind: last?.kind ?? null,
          lastAt: last?.created_at ?? null,
          lastMine: last?.sender_id === user.id,
          lastSenderName,
          unread,
          unreadCount: unreadCountByConv.get(c.id) ?? 0,
          online: !isGroup && (members[0]?.online ?? false),
          lastSeenAt: !isGroup ? (members[0]?.lastSeenAt ?? null) : null,
          note: !isGroup ? (noteByUser.get(members[0].id) ?? null) : null,
          muted: mutedByConv.has(c.id),
          pinned: pinnedByConv.has(c.id),
          isRequest: !isGroup && requestByConv.get(c.id) === false,
          // A reaction newer than the last message becomes the preview line
          lastReaction: (() => {
            const rx = reactionByConv.get(c.id);
            if (!rx) return null;
            if (last && new Date(rx.created_at) <= new Date(last.created_at)) return null;
            return { emoji: rx.emoji, mine: rx.mine, onMine: rx.onMine };
          })(),
        } as InboxRow;
      })
      .filter(Boolean) as InboxRow[];
  }

  return (
    <>
      <MessagesHeader
        currentUserId={user.id}
        name={(me as any)?.display_name ?? (me as any)?.username ?? "You"}
        username={(me as any)?.username ?? null}
        avatarUrl={(me as any)?.avatar_url ?? null}
        hue={(me as any)?.avatar_hue ?? 280}
      />
      <PullToRefresh>
        <MessagesInbox rows={rows} currentUserId={user.id} />
      </PullToRefresh>
    </>
  );
}
