import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { CallLog, type CallEntry } from "@/components/calls/CallLog";
import { one } from "@/lib/supabase/typed";

type Prof = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_hue: number | null;
  avatar_url: string | null;
} | null;

export default async function CallsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { data } = await supabase
    .from("call_sessions")
    .select(
      "id, caller_id, receiver_id, conversation_id, type, status, answered_at, ended_at, created_at, " +
        "caller:profiles!call_sessions_caller_id_fkey(id, display_name, username, avatar_hue, avatar_url), " +
        "receiver:profiles!call_sessions_receiver_id_fkey(id, display_name, username, avatar_hue, avatar_url)",
    )
    .or(`caller_id.eq.${user.id},receiver_id.eq.${user.id}`)
    .order("created_at", { ascending: false })
    .limit(60);

  const entries: CallEntry[] = (data ?? []).map((c: any) => {
    const outgoing = c.caller_id === user.id;
    const peer = one(outgoing ? c.receiver : c.caller);
    const answered = !!c.answered_at;
    const durationSec =
      answered && c.ended_at
        ? Math.max(0, Math.round((new Date(c.ended_at).getTime() - new Date(c.answered_at).getTime()) / 1000))
        : null;
    // Incoming call that was never answered (missed or ended pre-answer).
    const missed = !outgoing && !answered && c.status !== "accepted";
    return {
      id: c.id,
      conversationId: c.conversation_id,
      peerId: peer?.id ?? null,
      peerName: peer?.display_name ?? peer?.username ?? "User",
      peerUsername: peer?.username ?? null,
      peerHue: peer?.avatar_hue ?? 280,
      peerAvatarUrl: peer?.avatar_url ?? null,
      type: c.type === "video" ? "video" : "audio",
      outgoing,
      missed,
      durationSec,
      at: c.created_at,
    };
  });

  return (
    <>
      <PageHeader title="Calls" showBack />
      <CallLog entries={entries} />
    </>
  );
}
