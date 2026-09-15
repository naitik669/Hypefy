"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";
import { isEmojiReply } from "@/components/diary/PageReplyEmbed";

/** Human verbs for non-text message kinds — never surface raw URLs in a toast. */
const KIND_VERB: Record<string, string> = {
  post: "shared a post",
  shot: "shared a Shot",
  gif: "sent a GIF",
  image: "sent a photo",
  video: "sent a video",
  voice: "sent a voice note",
};

type Toast = {
  key: string;
  convId: string;
  title: string;
  name: string;
  hue: number;
  avatarUrl: string | null;
  line: string;
};

type Membership = { muted: boolean; isGroup: boolean; title: string | null };

const AUTO_DISMISS_MS = 4500;
const MAX_VISIBLE = 3;

/**
 * App-wide listener that pops a toast when someone messages or reacts in a DM
 * or group you're in. Tapping it opens the thread. Membership + mute state is
 * preloaded so the toast renders instantly and synchronously (no await before
 * first paint); the sender's name/avatar is enriched in the background. It is
 * mute-aware and suppressed while you're already viewing that thread.
 */
export function InAppNotifier({ currentUserId }: { currentUserId: string }) {
  const supabase = createClient();
  const router = useRouter();
  const pathname = usePathname();
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Latest pathname available inside realtime callbacks without re-subscribing.
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // conversation_id -> my membership context (preloaded, kept warm).
  const membership = useRef<Map<string, Membership>>(new Map());

  function dismiss(key: string) {
    setToasts((t) => t.filter((x) => x.key !== key));
    const tm = timers.current.get(key);
    if (tm) { clearTimeout(tm); timers.current.delete(key); }
  }

  function push(t: Toast) {
    setToasts((prev) => [t, ...prev.filter((x) => x.key !== t.key)].slice(0, MAX_VISIBLE));
    const existing = timers.current.get(t.key);
    if (existing) clearTimeout(existing);
    timers.current.set(t.key, setTimeout(() => dismiss(t.key), AUTO_DISMISS_MS));
  }

  function patch(key: string, fields: Partial<Toast>) {
    setToasts((prev) => prev.map((x) => (x.key === key ? { ...x, ...fields } : x)));
  }

  function open(t: Toast) {
    dismiss(t.key);
    router.push(`/messages/${t.convId}`);
  }

  // Resolve my membership for a conversation: from the warm cache, else fetched
  // once (RLS-gated — a non-member read returns nothing). Returns null if I'm
  // not a member of the conversation.
  async function getMembership(convId: string): Promise<Membership | null> {
    const cached = membership.current.get(convId);
    if (cached) return cached;
    const [memberRes, convRes] = await Promise.all([
      supabase.from("conversation_members").select("muted_at").eq("conversation_id", convId).eq("user_id", currentUserId).maybeSingle(),
      supabase.from("conversations").select("type, title").eq("id", convId).maybeSingle(),
    ]);
    if (!memberRes.data) return null;
    const conv = convRes.data as { type: string; title: string | null } | null;
    const m: Membership = {
      muted: !!(memberRes.data as { muted_at: string | null }).muted_at,
      isGroup: conv?.type === "group",
      title: conv?.title ?? null,
    };
    membership.current.set(convId, m);
    return m;
  }

  async function enrichName(key: string, userId: string) {
    const { data } = await supabase
      .from("profiles")
      .select("display_name, username, avatar_hue, avatar_url")
      .eq("id", userId)
      .maybeSingle();
    const p = data as { display_name: string | null; username: string | null; avatar_hue: number | null; avatar_url: string | null } | null;
    if (!p) return { name: "Someone", hue: 280, avatarUrl: null as string | null };
    return {
      name: p.display_name ?? p.username ?? "Someone",
      hue: p.avatar_hue ?? 280,
      avatarUrl: p.avatar_url ?? null,
    };
  }

  useEffect(() => {
    let channel: RealtimeChannel | null = null;
    let active = true;

    // Warm the membership/mute cache so toasts can render without awaiting.
    supabase
      .from("conversation_members")
      .select("conversation_id, muted_at, conversations(type, title)")
      .eq("user_id", currentUserId)
      .then(({ data }) => {
        (data ?? []).forEach((row: any) => {
          const conv = Array.isArray(row.conversations) ? row.conversations[0] : row.conversations;
          membership.current.set(row.conversation_id, {
            muted: !!row.muted_at,
            isGroup: conv?.type === "group",
            title: conv?.title ?? null,
          });
        });
      });

    async function handleMessage(row: { id: string; conversation_id: string; sender_id: string; body: string | null; kind: string }) {
      if (!active || row.sender_id === currentUserId) return;
      if (pathRef.current === `/messages/${row.conversation_id}`) return; // viewing it
      const mem = await getMembership(row.conversation_id);
      if (!mem || mem.muted) return;
      const content =
        row.kind === "page_reply"
          ? isEmojiReply(row.body) ? `Reacted ${row.body} to your page` : `Replied to your page: ${row.body ?? ""}`
          : KIND_VERB[row.kind] ?? (row.body ?? "Sent a message");
      const key = `m-${row.id}`;
      // Render immediately with what we know; enrich the sender below.
      push({
        key,
        convId: row.conversation_id,
        title: mem.isGroup ? (mem.title ?? "Group") : "New message",
        name: "",
        hue: 280,
        avatarUrl: null,
        line: content,
      });
      const who = await enrichName(key, row.sender_id);
      if (!active) return;
      patch(key, {
        title: mem.isGroup ? (mem.title ?? "Group") : who.name,
        name: who.name,
        hue: who.hue,
        avatarUrl: who.avatarUrl,
        line: mem.isGroup ? `${who.name}: ${content}` : content,
      });
    }

    async function handleReaction(row: { message_id: string; user_id: string; emoji: string }) {
      if (!active || row.user_id === currentUserId) return;
      const { data: msg } = await supabase
        .from("messages")
        .select("conversation_id, sender_id")
        .eq("id", row.message_id)
        .maybeSingle();
      const m = msg as { conversation_id: string; sender_id: string } | null;
      if (!m || m.sender_id !== currentUserId) return; // only reactions to MY messages
      if (pathRef.current === `/messages/${m.conversation_id}`) return;
      const mem = await getMembership(m.conversation_id);
      if (!mem || mem.muted) return;
      const verb = row.emoji === "⭐" ? "hyped your message" : `reacted ${row.emoji} to your message`;
      const key = `r-${row.message_id}-${row.user_id}`;
      const who = await enrichName(key, row.user_id);
      if (!active) return;
      push({
        key,
        convId: m.conversation_id,
        title: mem.isGroup ? (mem.title ?? "Group") : who.name,
        name: who.name,
        hue: who.hue,
        avatarUrl: who.avatarUrl,
        line: `${who.name} ${verb}`,
      });
    }

    channel = supabase
      .channel(`inapp-notify:${currentUserId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, ({ new: row }) => {
        handleMessage(row as Parameters<typeof handleMessage>[0]);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_reactions" }, ({ new: row }) => {
        handleReaction(row as Parameters<typeof handleReaction>[0]);
      })
      .subscribe();

    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
      timers.current.forEach((tm) => clearTimeout(tm));
      timers.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(var(--sat)+8px)] z-[150] mx-auto flex w-full max-w-[480px] flex-col gap-2 px-3">
      {toasts.map((t) => (
        <div
          key={t.key}
          role="button"
          tabIndex={0}
          onClick={() => open(t)}
          className="animate-toast-drop pointer-events-auto flex items-center gap-3 rounded-2xl border border-border bg-elevated/95 px-3 py-2.5 shadow-2xl backdrop-blur-xl"
        >
          <Avatar name={t.name || t.title} hue={t.hue} size={40} src={t.avatarUrl ?? undefined} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight">{t.title}</p>
            <p className="truncate text-xs text-muted">{t.line}</p>
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={(e) => { e.stopPropagation(); dismiss(t.key); }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-faint hover:bg-white/5"
          >
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}
