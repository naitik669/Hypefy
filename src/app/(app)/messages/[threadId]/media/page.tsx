import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { ConversationMedia, type MediaItem } from "@/components/messages/ConversationMedia";
import { parseAlbum } from "@/lib/chat-album";

/**
 * Everything shared in one conversation.
 *
 * There was no way to see this. Once a photo scrolled out of the thread the
 * only route back to it was scrolling, and voice notes and documents were
 * effectively unfindable after a day.
 *
 * Membership is enforced by RLS on `messages`, so a non-member's query simply
 * returns nothing — but the explicit check below turns that into a 404 rather
 * than an empty gallery, which would read as "nothing was shared".
 */
export default async function ConversationMediaPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { data: membership } = await supabase
    .from("conversation_members")
    .select("user_id")
    .eq("conversation_id", threadId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) notFound();

  const { data } = await supabase
    .from("messages")
    .select("id, kind, body, metadata, sender_id, created_at")
    .eq("conversation_id", threadId)
    .in("kind", ["image", "video", "gif", "document", "voice", "album"])
    .eq("is_unsent", false)
    .order("created_at", { ascending: false })
    .limit(200);

  const items: MediaItem[] = (data ?? []).flatMap((m: Record<string, unknown>): MediaItem[] => {
    // A folder of photos shows each of them, not the folder.
    if (m.kind === "album") {
      return (parseAlbum(m.body as string)?.items ?? []).map((it, i) => ({
        id: `${m.id as string}-${i}`,
        kind: it.type,
        url: it.url,
        name: null,
        mine: (m.sender_id as string) === user.id,
        at: m.created_at as string,
      }));
    }
    const meta = (m.metadata ?? {}) as Record<string, unknown>;
    return [{
      id: m.id as string,
      kind: m.kind as MediaItem["kind"],
      // Media messages carry their URL in the body; documents keep a filename
      // in metadata so the list can show something readable.
      url: (m.body as string) ?? "",
      name: (meta.name as string) ?? null,
      mine: (m.sender_id as string) === user.id,
      at: m.created_at as string,
    }];
  });

  return (
    <>
      <PageHeader title="Media and files" showBack />
      <ConversationMedia items={items} />
    </>
  );
}
