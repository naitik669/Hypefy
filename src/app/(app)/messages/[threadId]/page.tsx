import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RealChatView } from "@/components/messages/RealChatView";

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
      .select("user_id, profiles(id, display_name, username, avatar_hue)")
      .eq("conversation_id", threadId),
    supabase.from("conversations").select("type, title").eq("id", threadId).maybeSingle(),
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
  const group = isGroup
    ? {
        title:
          conv?.title ||
          others.slice(0, 3).map((p: any) => p.display_name ?? p.username ?? "User").join(", ") +
            (others.length > 3 ? ` +${others.length - 3}` : ""),
        memberCount: members.length,
      }
    : null;

  // Messages with post previews
  const { data: rawMsgs } = await supabase
    .from("messages")
    .select("id, body, sender_id, kind, post_id, reply_to_id, is_unsent, created_at, post:posts(id, caption, image_url, image_urls, profiles(username, display_name, avatar_hue))")
    .eq("conversation_id", threadId)
    .order("created_at", { ascending: true })
    .limit(200);

  const messages = (rawMsgs ?? []).map((m: any) => ({
    ...m,
    post: m.post
      ? { ...(Array.isArray(m.post) ? m.post[0] : m.post),
          profiles: undefined }
      : null,
    postProfile: m.post
      ? (() => { const p = Array.isArray(m.post) ? m.post[0] : m.post; const pr = Array.isArray(p?.profiles) ? p.profiles[0] : p?.profiles; return pr; })()
      : null,
  }));

  // Reactions for these messages
  const msgIds = messages.map((m: any) => m.id);
  const { data: reactRows } = msgIds.length
    ? await supabase.from("message_reactions").select("message_id, user_id, emoji").in("message_id", msgIds)
    : { data: [] as any[] };

  return (
    <RealChatView
      conversationId={threadId}
      currentUserId={user.id}
      other={{
        id: op?.id ?? "",
        name: op?.display_name ?? op?.username ?? "User",
        username: op?.username ?? null,
        hue: op?.avatar_hue ?? 280,
      }}
      group={group}
      members={membersMap}
      initialMessages={messages}
      initialReactions={(reactRows ?? []) as any}
    />
  );
}
