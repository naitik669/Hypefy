import { redirect } from "next/navigation";
import Link from "next/link";
import { PenSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { MessagesInbox, type InboxRow } from "@/components/messages/MessagesInbox";

export default async function MessagesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

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
      // Latest messages across these conversations
      supabase
        .from("messages")
        .select("conversation_id, body, kind, created_at, sender_id")
        .in("conversation_id", convIds)
        .order("created_at", { ascending: false }),
      // My membership state per conversation (read + request + block)
      supabase
        .from("conversation_members")
        .select("conversation_id, last_read_at, request_accepted, blocked_at, muted_at")
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
    const membersByConv = new Map<string, { id: string; name: string; username: string | null; hue: number; avatarUrl: string | null; online: boolean }[]>();
    (membersRes.data ?? []).forEach((m: any) => {
      const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
      if (!p) return;
      const arr = membersByConv.get(m.conversation_id) ?? [];
      const online =
        p.show_activity !== false &&
        !!p.last_seen_at &&
        Date.now() - new Date(p.last_seen_at).getTime() < 90_000;
      arr.push({ id: p.id, name: p.display_name ?? p.username ?? "User", username: p.username ?? null, hue: p.avatar_hue ?? 280, avatarUrl: p.avatar_url ?? null, online });
      membersByConv.set(m.conversation_id, arr);
    });

    const lastByConv = new Map<string, any>();
    (msgsRes.data ?? []).forEach((m: any) => {
      if (!lastByConv.has(m.conversation_id)) lastByConv.set(m.conversation_id, m);
    });

    const readByConv = new Map<string, string | null>();
    const requestByConv = new Map<string, boolean>();
    const blockedByConv = new Set<string>();
    const mutedByConv = new Set<string>();
    (myMemberRes.data ?? []).forEach((m: any) => {
      readByConv.set(m.conversation_id, m.last_read_at);
      requestByConv.set(m.conversation_id, m.request_accepted !== false);
      if (m.blocked_at) blockedByConv.add(m.conversation_id);
      if (m.muted_at) mutedByConv.add(m.conversation_id);
    });

    // Count unread messages per conversation (messages after my last_read_at, not sent by me)
    const unreadCountByConv = new Map<string, number>();
    (msgsRes.data ?? []).forEach((m: any) => {
      if (m.sender_id === user.id) return;
      const lastRead = readByConv.get(m.conversation_id) ?? null;
      if (!lastRead || new Date(m.created_at) > new Date(lastRead)) {
        unreadCountByConv.set(m.conversation_id, (unreadCountByConv.get(m.conversation_id) ?? 0) + 1);
      }
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
          muted: mutedByConv.has(c.id),
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
      <PageHeader
        title="Messages"
        right={
          <Link
            href="/messages/new"
            aria-label="New message"
            className="flex h-10 w-10 items-center justify-center rounded-full text-foreground hover:bg-white/5"
          >
            <PenSquare size={22} />
          </Link>
        }
      />
      <MessagesInbox rows={rows} currentUserId={user.id} />
    </>
  );
}
