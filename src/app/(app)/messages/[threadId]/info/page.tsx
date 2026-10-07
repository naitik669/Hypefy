import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ConversationInfo } from "@/components/messages/ConversationInfo";
import { SHARED_KINDS, SHARED_SELECT, sortShared, type SharedRow } from "@/lib/chat-shared";

/**
 * Conversation settings — for a DM as well as a group.
 *
 * Tapping the name in a thread used to link straight to /u/[username], which
 * leaves the conversation entirely: there was no per-conversation screen for a
 * 1:1 at all, and groups only had a bottom sheet you could not link to or
 * return to with back.
 *
 * It is also the missing front end for migration 0032, which shipped
 * vanish_mode, auto_delete_after and screenshot_alert_at with full RPCs and no
 * UI — while an hourly cron (purge_expired_messages) sat live, deleting
 * messages according to a column nobody could set.
 */
export default async function ConversationInfoPage({
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

  const [{ data: members }, { data: conv }] = await Promise.all([
    supabase
      .from("conversation_members")
      .select(
        "user_id, role, muted_at, profiles(id, display_name, username, avatar_hue, avatar_url)"
      )
      .eq("conversation_id", threadId),
    supabase
      .from("conversations")
      .select("type, title, avatar_url, vanish_mode, auto_delete_after, screenshot_alert_at, theme")
      .eq("id", threadId)
      .maybeSingle(),
  ]);

  // RLS already blocks non-members, so an empty result means "not yours".
  if (!members || members.length === 0) notFound();
  const me = members.find((m: { user_id: string }) => m.user_id === user.id);
  if (!me) notFound();

  const prof = (m: Record<string, unknown>) =>
    Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;

  const isGroup = conv?.type === "group";
  const others = members
    .filter((m: { user_id: string }) => m.user_id !== user.id)
    .map((m) => prof(m as Record<string, unknown>))
    .filter(Boolean) as Record<string, unknown>[];

  const roster = members
    .map((m) => {
      const p = prof(m as Record<string, unknown>) as Record<string, unknown> | null;
      if (!p) return null;
      return {
        id: p.id as string,
        name: (p.display_name as string) ?? (p.username as string) ?? "User",
        username: (p.username as string) ?? null,
        hue: (p.avatar_hue as number) ?? 280,
        avatarUrl: (p.avatar_url as string) ?? null,
        role: ((m as Record<string, unknown>).role as string) ?? "member",
      };
    })
    .filter(Boolean) as {
    id: string;
    name: string;
    username: string | null;
    hue: number;
    avatarUrl: string | null;
    role: string;
  }[];

  const peer = others[0] ?? null;
  const title = isGroup
    ? (conv?.title as string) ||
      others
        .slice(0, 3)
        .map((p) => (p.display_name as string) ?? (p.username as string) ?? "User")
        .join(", ")
    : ((peer?.display_name as string) ?? (peer?.username as string) ?? "User");

  // How many photos, videos, voice notes and files this conversation holds —
  // so the Media row can say whether it is worth opening.
  // What this person can theme the chat with.
  const [{ data: mine }, { data: bought }] = await Promise.all([
    supabase.from("profiles").select("is_premium").eq("id", user.id).maybeSingle(),
    supabase.from("purchases").select("product_id").eq("user_id", user.id),
  ]);

  // What has been shared here, for the card that leads to it: how many of
  // each kind, and the newest few photos.
  const [{ data: sharedRows }, { data: linkRows }] = await Promise.all([
    supabase
      .from("messages")
      .select(SHARED_SELECT)
      .eq("conversation_id", threadId)
      .in("kind", SHARED_KINDS)
      .eq("is_unsent", false)
      .order("created_at", { ascending: false })
      .limit(300),
    // Links live inside ordinary messages, so they are asked for by what they contain.
    supabase
      .from("messages")
      .select("id, kind, body, sender_id, created_at")
      .eq("conversation_id", threadId)
      .eq("kind", "text")
      .eq("is_unsent", false)
      .ilike("body", "%http%")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  const shared = sortShared(
    [...((sharedRows ?? []) as unknown as SharedRow[]), ...((linkRows ?? []) as unknown as SharedRow[])].sort((a, b) =>
      a.created_at < b.created_at ? 1 : -1,
    ),
  );
  const people = Object.fromEntries(roster.map((m) => [m.id, { name: m.name, hue: m.hue, avatarUrl: m.avatarUrl }]));

  return (
    <ConversationInfo
      conversationId={threadId}
      currentUserId={user.id}
      isGroup={isGroup}
      title={title}
      avatarUrl={
        isGroup
          ? ((conv?.avatar_url as string) ?? null)
          : ((peer?.avatar_url as string) ?? null)
      }
      peer={
        peer
          ? {
              id: peer.id as string,
              username: (peer.username as string) ?? null,
              hue: (peer.avatar_hue as number) ?? 280,
            }
          : null
      }
      members={roster}
      myRole={((me as Record<string, unknown>).role as string) ?? "member"}
      muted={!!(me as Record<string, unknown>).muted_at}
      vanishMode={!!conv?.vanish_mode}
      autoDeleteAfter={(conv?.auto_delete_after as string) ?? null}
      screenshotAlert={!!conv?.screenshot_alert_at}
      shared={shared}
      people={people}
      theme={(conv?.theme as string | null) ?? null}
      isPremium={!!mine?.is_premium}
      ownedThemes={(bought ?? []).map((b) => b.product_id)}
    />
  );
}
