import { redirect } from "next/navigation";
import Link from "next/link";
import { PenSquare, MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Avatar } from "@/components/ui/Avatar";

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

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

  let rows: any[] = [];
  if (convIds.length > 0) {
    // The other participant in each conversation
    const { data: members } = await supabase
      .from("conversation_members")
      .select("conversation_id, user_id, profiles(id, display_name, username, avatar_hue)")
      .in("conversation_id", convIds)
      .neq("user_id", user.id);

    // Latest messages across these conversations
    const { data: msgs } = await supabase
      .from("messages")
      .select("conversation_id, body, created_at, sender_id")
      .in("conversation_id", convIds)
      .order("created_at", { ascending: false });

    const otherByConv = new Map<string, any>();
    (members ?? []).forEach((m: any) => {
      const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
      if (!otherByConv.has(m.conversation_id)) otherByConv.set(m.conversation_id, p);
    });

    const lastByConv = new Map<string, any>();
    (msgs ?? []).forEach((m: any) => {
      if (!lastByConv.has(m.conversation_id)) lastByConv.set(m.conversation_id, m);
    });

    rows = (convs ?? [])
      .map((c: any) => ({
        id: c.id,
        other: otherByConv.get(c.id),
        last: lastByConv.get(c.id),
      }))
      .filter((r) => r.other); // skip conversations with no resolvable other member
  }

  return (
    <>
      <PageHeader
        title="Messages"
        right={
          <Link href="/search" aria-label="New message"
            className="flex h-10 w-10 items-center justify-center rounded-full text-foreground hover:bg-white/5">
            <PenSquare size={22} />
          </Link>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={MessageCircle}
          title="No messages yet"
          text="Open someone's profile and tap Message to start a chat."
          ctaLabel="Discover people"
          ctaHref="/discover"
        />
      ) : (
        <div className="flex flex-col">
          {rows.map((r) => {
            const name = r.other.display_name ?? r.other.username ?? "User";
            const hue = r.other.avatar_hue ?? 280;
            const isMine = r.last?.sender_id === user.id;
            return (
              <Link key={r.id} href={`/messages/${r.id}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.03]">
                <Avatar name={name} hue={hue} size={52} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{name}</p>
                  <p className="truncate text-sm text-muted">
                    {r.last ? (isMine ? "You: " : "") + r.last.body : "Say hi 👋"}
                  </p>
                </div>
                {r.last && (
                  <span className="shrink-0 text-xs text-faint">{timeAgo(r.last.created_at)}</span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
