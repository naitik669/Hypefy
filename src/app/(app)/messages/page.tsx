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
    .select("id, last_message_at")
    .order("last_message_at", { ascending: false })
    .limit(50);

  const convIds = (convs ?? []).map((c: any) => c.id);

  let rows: InboxRow[] = [];
  if (convIds.length > 0) {
    const [membersRes, msgsRes, myMemberRes, followRes] = await Promise.all([
      // The other participant in each conversation
      supabase
        .from("conversation_members")
        .select("conversation_id, user_id, profiles(id, display_name, username, avatar_hue)")
        .in("conversation_id", convIds)
        .neq("user_id", user.id),
      // Latest messages across these conversations
      supabase
        .from("messages")
        .select("conversation_id, body, kind, created_at, sender_id")
        .in("conversation_id", convIds)
        .order("created_at", { ascending: false }),
      // My read state per conversation
      supabase
        .from("conversation_members")
        .select("conversation_id, last_read_at")
        .in("conversation_id", convIds)
        .eq("user_id", user.id),
      // Who I follow (to classify requests)
      supabase.from("follows").select("following_id").eq("follower_id", user.id),
    ]);

    const otherByConv = new Map<string, any>();
    (membersRes.data ?? []).forEach((m: any) => {
      const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
      if (!otherByConv.has(m.conversation_id)) otherByConv.set(m.conversation_id, p);
    });

    const lastByConv = new Map<string, any>();
    (msgsRes.data ?? []).forEach((m: any) => {
      if (!lastByConv.has(m.conversation_id)) lastByConv.set(m.conversation_id, m);
    });

    const readByConv = new Map<string, string | null>();
    (myMemberRes.data ?? []).forEach((m: any) => readByConv.set(m.conversation_id, m.last_read_at));

    const following = new Set((followRes.data ?? []).map((r: any) => r.following_id as string));

    rows = (convs ?? [])
      .map((c: any) => {
        const other = otherByConv.get(c.id);
        if (!other) return null;
        const last = lastByConv.get(c.id);
        const lastRead = readByConv.get(c.id) ?? null;
        const unread =
          !!last &&
          last.sender_id !== user.id &&
          (!lastRead || new Date(last.created_at) > new Date(lastRead));
        return {
          id: c.id,
          name: other.display_name ?? other.username ?? "User",
          username: other.username ?? null,
          hue: other.avatar_hue ?? 280,
          lastBody: last?.body ?? null,
          lastKind: last?.kind ?? null,
          lastAt: last?.created_at ?? null,
          lastMine: last?.sender_id === user.id,
          unread,
          isRequest: !following.has(other.id),
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
            href="/search"
            aria-label="New message"
            className="flex h-10 w-10 items-center justify-center rounded-full text-foreground hover:bg-white/5"
          >
            <PenSquare size={22} />
          </Link>
        }
      />
      <MessagesInbox rows={rows} />
    </>
  );
}
