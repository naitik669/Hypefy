import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { PinBoard } from "@/components/messages/PinBoard";
import { MAX_PINNED_MESSAGES, PIN_SELECT, toPins, type PinRow } from "@/lib/chat-pins";

/**
 * One conversation's pin board.
 *
 * A sibling of info and media, so a pin board is somewhere you navigate to
 * and can come back from, rather than a panel that only exists while a
 * gesture is held. The swipe in the thread pushes this route.
 *
 * Membership is enforced by RLS on `messages`, so a stranger's query returns
 * nothing — the explicit check turns that into a 404 instead of an empty
 * board, which would read as "they have not pinned anything".
 */
export default async function PinsPage({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const [{ data: members }, { data: conv }, { data: rows }] = await Promise.all([
    supabase
      .from("conversation_members")
      .select("user_id, profiles(display_name, username)")
      .eq("conversation_id", threadId),
    supabase.from("conversations").select("type").eq("id", threadId).maybeSingle(),
    supabase
      .from("messages")
      .select(PIN_SELECT)
      .eq("conversation_id", threadId)
      .not("pinned_at", "is", null)
      .eq("is_unsent", false)
      .is("removed_at", null)
      .order("pinned_at", { ascending: false })
      .limit(MAX_PINNED_MESSAGES),
  ]);

  if (!members?.some((m) => m.user_id === user.id)) notFound();

  const people: Record<string, { name: string }> = {};
  for (const m of members) {
    const p = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as
      | { display_name: string | null; username: string | null }
      | null;
    people[m.user_id] = { name: p?.display_name ?? p?.username ?? "User" };
  }

  return (
    <>
      <PageHeader title="Pinned" showBack />
      <PinBoard
        threadId={threadId}
        pins={toPins((rows ?? []) as unknown as PinRow[], user.id)}
        me={user.id}
        people={people}
        isGroup={conv?.type === "group"}
      />
    </>
  );
}
