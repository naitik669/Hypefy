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

  // Membership + other participant (RLS already blocks non-members)
  const { data: members } = await supabase
    .from("conversation_members")
    .select("user_id, profiles(id, display_name, username, avatar_hue)")
    .eq("conversation_id", threadId);

  if (!members || members.length === 0) notFound();
  const me = members.find((m: any) => m.user_id === user.id);
  if (!me) notFound();

  const otherRow = members.find((m: any) => m.user_id !== user.id);
  const op = otherRow
    ? (Array.isArray((otherRow as any).profiles) ? (otherRow as any).profiles[0] : (otherRow as any).profiles)
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
      initialMessages={messages}
    />
  );
}
