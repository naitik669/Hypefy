"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  useMembershipUpdate,
  useMessageInsert,
  useReactionChange,
} from "@/components/messages/MessageStream";
import { Avatar } from "@/components/ui/Avatar";
import { openIncoming } from "@/lib/e2ee/chat";
import { isEmojiReply } from "@/components/diary/PageReplyEmbed";

/** The columns of a message row a banner is built from. */
type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string | null;
  kind: string;
};
/** And of a reaction row. */
type ReactionRow = { message_id: string; user_id: string; emoji: string };

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

type Membership = { muted: boolean; isGroup: boolean; title: string | null; /** Locked or hidden: banners say nothing about it. */ locked?: boolean };

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
  /** Which of my chats are locked or hidden. Refreshed whenever levels are read. */
  const lockedIds = useRef<Set<string>>(new Set());
  function noteLevels(data: unknown) {
    if (!Array.isArray(data)) return;
    lockedIds.current = new Set(
      (data as { conversation_id: string; level: string }[])
        .filter((l) => l.level !== "normal")
        .map((l) => l.conversation_id),
    );
  }

  async function getMembership(convId: string): Promise<Membership | null> {
    const cached = membership.current.get(convId);
    if (cached) return cached;
    const [memberRes, convRes, levelsRes] = await Promise.all([
      supabase.from("conversation_members").select("muted_at").eq("conversation_id", convId).eq("user_id", currentUserId).maybeSingle(),
      supabase.from("conversations").select("type, title").eq("id", convId).maybeSingle(),
      supabase.rpc("my_chat_levels"),
    ]);
    if (!memberRes.data) return null;
    noteLevels(levelsRes.data);
    const conv = convRes.data as { type: string; title: string | null } | null;
    const m: Membership = {
      muted: !!(memberRes.data as { muted_at: string | null }).muted_at,
      isGroup: conv?.type === "group",
      title: conv?.title ?? null,
      locked: lockedIds.current.has(convId),
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

  /**
   * The two handlers, as the effect below defines them.
   *
   * They close over the membership cache and the toast queue that the effect
   * sets up, so they are published from inside it. Null while the effect has
   * not run or has been torn down — a row arriving then has nothing to warm
   * the cache from, and a banner without a name is the thing to avoid.
   */
  const onMessageRow = useRef<((row: MessageRow) => void) | null>(null);
  const onReactionRow = useRef<((row: ReactionRow) => void) | null>(null);

  useMessageInsert((row) => onMessageRow.current?.(row as unknown as MessageRow));
  useReactionChange((row, event) => {
    // The inbox wants every reaction event; a banner is only for a new one.
    if (event === "INSERT") onReactionRow.current?.(row as unknown as ReactionRow);
  });
  // Mute and lock both live on this row, and both are read from a cache
  // filled once at mount — this component lives in the layout, so that is
  // the life of the session. Without this, locking a chat while the app is
  // open kept showing its sender and a preview in a banner, which is the one
  // thing the lock exists to prevent, and muting one kept producing toasts.
  // Dropping the entry makes the next message read it again; the re-read
  // also refreshes lockedIds through noteLevels, so a chat locked on another
  // device is caught too.
  //
  // This never fired until 0155 published conversation_members.
  useMembershipUpdate((row) => {
    const id = (row as { conversation_id?: string }).conversation_id;
    if (id) membership.current.delete(id);
  });

  useEffect(() => {
    let active = true;

    // Warm the membership/mute cache so toasts can render without awaiting.
    // Levels first, so a locked chat is known to be locked before its first
    // banner could be drawn with a name on it.
    Promise.all([
      supabase.rpc("my_chat_levels"),
      supabase
        .from("conversation_members")
        .select("conversation_id, muted_at, conversations(type, title)")
        .eq("user_id", currentUserId),
    ]).then(([levelsRes, { data }]) => {
      noteLevels(levelsRes.data);
      (data ?? []).forEach((row) => {
        const conv = Array.isArray(row.conversations) ? row.conversations[0] : row.conversations;
        membership.current.set(row.conversation_id, {
          muted: !!row.muted_at,
          isGroup: conv?.type === "group",
          title: conv?.title ?? null,
          locked: lockedIds.current.has(row.conversation_id),
        });
      });
    });

    async function handleMessage(row: MessageRow) {
      if (!active || row.sender_id === currentUserId) return;
      if (pathRef.current === `/messages/${row.conversation_id}`) return; // viewing it
      const mem = await getMembership(row.conversation_id);
      if (!mem || mem.muted) return;
      // A locked chat: that a message came, and nothing about it. No name,
      // no group title, no preview, no face. Tapping it leads to the PIN.
      if (mem.locked) {
        push({
          key: `m-${row.id}`,
          convId: row.conversation_id,
          title: "New message",
          name: "",
          hue: 280,
          avatarUrl: null,
          line: "Open to read",
        });
        return;
      }
      // An encrypted body has to be opened before it can be shown; failing
      // that, the toast says a message arrived and nothing about it.
      const opened = mem.isGroup
        ? ({ state: "plain" } as const)
        : await openIncoming({
            body: row.body,
            senderId: row.sender_id,
            myId: currentUserId,
            peerId: row.sender_id,
          });
      if (!active) return;
      const body = opened.state === "open" ? opened.text : opened.state === "locked" ? null : row.body;
      const content =
        opened.state === "locked"
          ? "Message is locked"
          : row.kind === "page_reply"
          ? isEmojiReply(body) ? `Reacted ${body} to your page` : `Replied to your page: ${body ?? ""}`
          : KIND_VERB[row.kind] ?? (body ?? "Sent a message");
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

    async function handleReaction(row: ReactionRow) {
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
      // A reaction banner is a name and a face: not for a locked chat.
      if (!mem || mem.muted || mem.locked) return;
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

    // Published to the hooks below rather than wired to a channel of this
    // component's own: the shell keeps one subscription for everything
    // (MessageStream), and these two closures are what it calls.
    onMessageRow.current = handleMessage;
    onReactionRow.current = handleReaction;

    return () => {
      active = false;
      onMessageRow.current = null;
      onReactionRow.current = null;
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
