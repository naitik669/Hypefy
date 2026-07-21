"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, MessageCircle, Users, Check, Ban, Loader2, BellOff, Bell, Pin, PinOff, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { EmptyState } from "@/components/ui/EmptyState";
import { PresenceDot } from "@/components/presence/PresenceDot";
import { parseTrack } from "@/lib/music";

export type InboxRow = {
  id: string;
  name: string;
  username: string | null;
  hue: number;
  avatarUrl?: string | null;
  isGroup: boolean;
  memberCount: number;
  lastBody: string | null;
  lastKind: string | null;
  lastAt: string | null;
  lastMine: boolean;
  lastSenderName: string | null;
  unread: boolean;
  unreadCount: number;
  online: boolean;
  lastSeenAt: string | null;
  muted: boolean;
  pinned: boolean;
  isRequest: boolean;
  /** The other person's active status (DMs only) — shown as a bubble on the row. */
  status?: { text: string; track?: unknown } | null;
  /** Set when a reaction is newer than the last message — becomes the preview */
  lastReaction?: { emoji: string; mine: boolean; onMine: boolean } | null;
};

/** The other person's active status, as a small speech bubble on their row. */
function StatusBubble({ status }: { status: NonNullable<InboxRow["status"]> }) {
  const track = parseTrack(status.track);
  return (
    <span className="ml-auto flex max-w-[52%] shrink items-center gap-1 rounded-lg rounded-bl-sm border border-border/70 bg-surface px-1.5 py-0.5">
      {track?.artwork && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={track.artwork} alt="" className="h-3 w-3 shrink-0 rounded-full object-cover" />
      )}
      <span className="truncate text-[11px] font-medium text-foreground/90">{status.text}</span>
    </span>
  );
}

/** A message-body snippet windowed around the query, with the match marked. */
function highlightSnippet(body: string, query: string) {
  const idx = body.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return body;
  const start = Math.max(0, idx - 24);
  const pre = (start > 0 ? "…" : "") + body.slice(start, idx);
  const match = body.slice(idx, idx + query.length);
  const post = body.slice(idx + query.length);
  return (
    <>
      {pre}
      <mark className="rounded bg-accent/25 px-0.5 text-foreground">{match}</mark>
      {post}
    </>
  );
}

function GroupAvatar() {
  return (
    <div
      className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[30%]"
      style={{ background: "linear-gradient(140deg, hsl(210 70% 52%), hsl(260 65% 42%))" }}
    >
      <Users size={24} className="text-white/95" />
    </div>
  );
}

/** Shows "1"–"9" or "9+" for counts > 9 */
function UnreadBadge({ count }: { count: number }) {
  const label = count > 9 ? "9+" : String(count);
  return (
    <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-black leading-none text-accent-ink">
      {label}
    </span>
  );
}

type Tab = "all" | "unread" | "requests";

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/** Human verbs for non-text message kinds — never show raw URLs. */
const KIND_VERB: Record<string, string> = {
  post: "shared a post",
  shot: "shared a Shot",
  gif: "sent a GIF",
  image: "sent a photo",
  video: "sent a video",
  voice: "sent a voice note",
};

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function preview(r: InboxRow) {
  // 1. Fresh reaction beats the last message
  if (r.lastReaction) {
    const { emoji, mine, onMine } = r.lastReaction;
    const target = onMine ? (mine ? "their message" : "your message") : "a message";
    const verb = emoji === "⭐" ? `hyped ${target}` : `reacted ${emoji} to ${target}`;
    return mine ? `You ${emoji === "⭐" ? "hyped a message" : `reacted ${emoji} to a message`}` : cap(verb);
  }

  if (!r.lastAt) return r.isGroup ? "New group" : "Say hi 👋";

  const verb = r.lastKind ? KIND_VERB[r.lastKind] : undefined;

  if (verb) {
    // Media/share kinds read as a sentence: "You sent a photo" / "Aman sent a GIF"
    if (r.lastMine) return `You ${verb}`;
    if (r.isGroup && r.lastSenderName) return `${r.lastSenderName} ${verb}`;
    return cap(verb);
  }

  const body = r.lastBody ?? "Sent a message";
  if (r.isGroup) {
    const who = r.lastMine ? "You" : r.lastSenderName;
    return who ? `${who}: ${body}` : body;
  }
  return (r.lastMine ? "You: " : "") + body;
}

export function MessagesInbox({ rows, currentUserId, children }: { rows: InboxRow[]; currentUserId: string; children?: React.ReactNode }) {
  const supabase = createClient();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  // conversation_id → a matching message body, for content search (2b).
  const [contentMatches, setContentMatches] = useState<Map<string, string>>(new Map());
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Conversations the user has opened — optimistically clear their unread state.
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  // Long-press action menu (pin / mute / delete) for a conversation row.
  const [menuRow, setMenuRow] = useState<InboxRow | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);

  function openMenu(r: InboxRow) {
    if (r.isRequest) return; // requests have their own actions
    suppressClick.current = true;
    setMenuRow(r);
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(8);
  }
  function onPressStart(r: InboxRow) {
    pressTimer.current = setTimeout(() => { pressTimer.current = null; openMenu(r); }, 420);
  }
  function onPressEnd() {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
  }

  async function togglePin(r: InboxRow) {
    setActionBusy(true);
    await supabase.from("conversation_members")
      .update({ pinned_at: r.pinned ? null : new Date().toISOString() })
      .eq("conversation_id", r.id).eq("user_id", currentUserId);
    setActionBusy(false);
    setMenuRow(null);
    router.refresh();
  }
  async function toggleMute(r: InboxRow) {
    setActionBusy(true);
    await supabase.from("conversation_members")
      .update({ muted_at: r.muted ? null : new Date().toISOString() })
      .eq("conversation_id", r.id).eq("user_id", currentUserId);
    setActionBusy(false);
    setMenuRow(null);
    router.refresh();
  }
  async function deleteChat(r: InboxRow) {
    setActionBusy(true);
    const { error } = await supabase.rpc("leave_conversation", { p_conversation_id: r.id });
    setActionBusy(false);
    setMenuRow(null);
    if (!error) { setRemovedIds((p) => new Set(p).add(r.id)); router.refresh(); }
  }

  // Seed readIds from sessionStorage so navigating to a thread and back doesn't
  // re-show the unread badge for conversations we already opened this session.
  useEffect(() => {
    try {
      const stored = JSON.parse(sessionStorage.getItem("hypefy:inbox:read") ?? "[]") as string[];
      if (stored.length) setReadIds(new Set(stored));
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime: keep the inbox live without a manual refresh.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 150);
    };
    const channel = supabase
      .channel(`inbox-realtime:${currentUserId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const m = payload.new as { sender_id?: string; conversation_id?: string };
        if (m.sender_id === currentUserId) return;
        // New incoming message: revoke the "already read" flag so the unread badge reappears.
        if (m.conversation_id) {
          setReadIds((prev) => {
            if (!prev.has(m.conversation_id!)) return prev;
            const next = new Set(prev);
            next.delete(m.conversation_id!);
            try { sessionStorage.setItem("hypefy:inbox:read", JSON.stringify([...next])); } catch { /* ignore */ }
            return next;
          });
        }
        refresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, refresh)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversations" }, refresh)
      // When my last_read_at updates (i.e. I opened the thread on another device / tab),
      // mark that conversation as read locally so the badge clears immediately.
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "conversation_members",
        filter: `user_id=eq.${currentUserId}`,
      }, (payload) => {
        const m = payload.new as { conversation_id?: string; last_read_at?: string };
        if (m.conversation_id && m.last_read_at) {
          setReadIds((prev) => {
            const next = new Set(prev).add(m.conversation_id!);
            try { sessionStorage.setItem("hypefy:inbox:read", JSON.stringify([...next])); } catch { /* ignore */ }
            return next;
          });
        }
        refresh();
      })
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [supabase, currentUserId, router]);

  // Muted conversations never surface as unread (no badge, no Unread section)
  const isUnread = (r: InboxRow) => r.unread && !r.muted && !readIds.has(r.id);
  const isPendingRequest = (r: InboxRow) => r.isRequest && !approvedIds.has(r.id) && !removedIds.has(r.id);

  async function approveRequest(id: string) {
    setBusyId(id);
    const { error } = await supabase.rpc("approve_message_request", { p_conversation_id: id });
    setBusyId(null);
    if (!error) setApprovedIds((p) => new Set(p).add(id));
  }
  async function blockRequest(id: string) {
    setBusyId(id);
    const { error } = await supabase.rpc("block_message_request", { p_conversation_id: id });
    setBusyId(null);
    if (!error) setRemovedIds((p) => new Set(p).add(id));
  }

  const unreadCount = rows.filter((r) => isUnread(r) && !isPendingRequest(r) && !removedIds.has(r.id)).length;
  const requestCount = rows.filter((r) => isPendingRequest(r)).length;

  // Content search: match recent message bodies for the typed query, keeping
  // the first (newest) hit per conversation as the preview snippet.
  useEffect(() => {
    const query = q.trim();
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (query.length < 2) { setContentMatches(new Map()); return; }
    searchTimer.current = setTimeout(async () => {
      const ids = rows.map((r) => r.id);
      if (ids.length === 0) return;
      const { data } = await supabase
        .from("messages")
        .select("conversation_id, body, created_at")
        .in("conversation_id", ids)
        .eq("is_unsent", false)
        .ilike("body", `%${query}%`)
        .order("created_at", { ascending: false })
        .limit(100);
      const map = new Map<string, string>();
      (data ?? []).forEach((m: any) => {
        if (m.body && !map.has(m.conversation_id)) map.set(m.conversation_id, m.body);
      });
      setContentMatches(map);
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, rows]);

  const filtered = useMemo(() => {
    let list =
      tab === "unread"
        ? rows.filter((r) => isUnread(r) && !isPendingRequest(r) && !removedIds.has(r.id))
        : tab === "requests"
          ? rows.filter((r) => isPendingRequest(r))
          : rows.filter((r) => !isPendingRequest(r) && !removedIds.has(r.id));
    const query = q.trim().toLowerCase();
    if (query) {
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(query) ||
          (r.username ?? "").toLowerCase().includes(query) ||
          contentMatches.has(r.id),
      );
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, tab, q, readIds, approvedIds, removedIds, contentMatches]);

  // Split "All" tab into Pinned + Unread + rest
  const pinnedRows = tab === "all" ? filtered.filter((r) => r.pinned) : [];
  const unreadRows = tab === "all" ? filtered.filter((r) => isUnread(r) && !r.pinned) : [];
  const otherRows  = tab === "all" ? filtered.filter((r) => !isUnread(r) && !r.pinned) : filtered;

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={MessageCircle}
        title="It's quiet in here"
        text="Slide into a DM or rally a group chat."
        ctaLabel="New message"
        ctaHref="/messages/new"
      />
    );
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "all",      label: "All",      count: 0 },
    { key: "unread",   label: "Unread",   count: unreadCount },
    { key: "requests", label: "Requests", count: requestCount },
  ];

  function RowItem({ r }: { r: InboxRow }) {
    const unread = isUnread(r);
    const pending = isPendingRequest(r);
    const effectiveCount = unread ? r.unreadCount : 0;

    // When the match came from message content (not the name), show that
    // message as the preview with the query highlighted.
    const query = q.trim();
    const nameHit =
      !!query &&
      (r.name.toLowerCase().includes(query.toLowerCase()) ||
        (r.username ?? "").toLowerCase().includes(query.toLowerCase()));
    const matchBody = query && !nameHit ? contentMatches.get(r.id) : undefined;

    return (
      <div key={r.id} className={`[content-visibility:auto] [contain-intrinsic-size:auto_76px] ${pending ? "px-4 py-3" : ""}`}>
        <Link
          href={`/messages/${r.id}`}
          onClick={(e) => {
            if (suppressClick.current) { e.preventDefault(); suppressClick.current = false; return; }
            setReadIds((prev) => {
              const next = new Set(prev).add(r.id);
              try { sessionStorage.setItem("hypefy:inbox:read", JSON.stringify([...next])); } catch { /* ignore */ }
              return next;
            });
          }}
          onPointerDown={() => onPressStart(r)}
          onPointerUp={onPressEnd}
          onPointerLeave={onPressEnd}
          onPointerMove={onPressEnd}
          onContextMenu={(e) => { e.preventDefault(); openMenu(r); }}
          className={`flex items-center gap-3 transition-colors hover:bg-white/[0.03] ${pending ? "" : "px-4 py-3"}`}
        >
          <div className="relative shrink-0">
            {r.isGroup ? <GroupAvatar /> : <Avatar name={r.name} hue={r.hue} size={52} src={r.avatarUrl ?? undefined} />}
            {!r.isGroup && <PresenceDot lastSeenAt={r.lastSeenAt} size="md" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className={`truncate text-sm ${unread ? "font-bold text-foreground" : "font-semibold"}`}>
                {r.name}
                {r.isGroup && <span className="ml-1.5 text-xs font-normal text-faint">· {r.memberCount}</span>}
              </span>
              {r.status && <StatusBubble status={r.status} />}
            </div>
            <p className={`truncate text-sm ${unread ? "font-semibold text-foreground" : "text-muted"}`}>
              {matchBody ? highlightSnippet(matchBody, query) : preview(r)}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <span className="flex items-center gap-1.5">
              {r.pinned && <Pin size={12} className="rotate-45 fill-faint text-faint" />}
              {r.muted && <BellOff size={12} className="text-faint" />}
              {r.lastAt && <span className="text-xs text-faint">{timeAgo(r.lastAt)}</span>}
            </span>
            {effectiveCount > 0 && !pending && <UnreadBadge count={effectiveCount} />}
          </div>
        </Link>

        {/* Request actions */}
        {pending && (
          <div className="mt-2.5 flex gap-2 pl-[64px]">
            <button
              type="button"
              onClick={() => approveRequest(r.id)}
              disabled={busyId === r.id}
              className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent text-sm font-bold text-accent-ink transition-transform active:scale-[0.98] disabled:opacity-60"
            >
              {busyId === r.id ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Approve
            </button>
            <button
              type="button"
              onClick={() => blockRequest(r.id)}
              disabled={busyId === r.id}
              className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface text-sm font-semibold text-red-400 transition-colors hover:bg-white/5 disabled:opacity-60"
            >
              <Ban size={15} /> Block
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {/* Search */}
      <div className="px-4 pt-3">
        <div className="flex h-11 items-center gap-2 rounded-2xl border border-border bg-surface px-3.5 focus-within:border-white/25">
          <Search size={17} className="shrink-0 text-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search messages"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
          />
        </div>
      </div>

      {/* Status rail (or any slot passed from parent) */}
      {children}

      {/* Filter tabs */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-1 pt-3">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex shrink-0 items-center gap-1.5 rounded-pill px-4 py-1.5 text-sm font-semibold transition-colors ${
              tab === t.key ? "bg-accent text-accent-ink" : "bg-surface text-muted"
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span
                className={`flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                  tab === t.key ? "bg-accent-ink/15 text-accent-ink" : "bg-accent text-accent-ink"
                }`}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <p className="px-4 py-12 text-center text-sm text-faint">
          {tab === "requests"
            ? "No requests, your door is clear."
            : tab === "unread"
              ? "All caught up. Zero noise. 🎉"
              : "Nobody by that name."}
        </p>
      ) : (
        <div className="flex flex-col pt-1">
          {/* Requests explainer — what this tab is and what accepting does */}
          {tab === "requests" && (
            <div className="mx-4 mb-2 mt-2 rounded-2xl border border-border bg-surface px-4 py-3">
              <p className="text-sm font-semibold">Message requests</p>
              <p className="mt-0.5 text-xs leading-snug text-muted">
                People you don&apos;t follow land here first. They can&apos;t see when you&apos;ve
                read it until you approve, blocking is silent.
              </p>
            </div>
          )}

          {/* Pinned section — top of the "All" tab */}
          {pinnedRows.length > 0 && (
            <>
              <p className="flex items-center gap-1 px-4 pb-1 pt-2 text-[11px] font-bold uppercase tracking-widest text-faint">
                <Pin size={11} className="rotate-45 fill-faint" /> Pinned
              </p>
              {pinnedRows.map((r) => <RowItem key={r.id} r={r} />)}
              <div className="mx-4 my-1 h-px bg-border/50" />
            </>
          )}

          {/* Unread section — only shown in "All" tab when there are unread rows */}
          {unreadRows.length > 0 && (
            <>
              <p className="px-4 pb-1 pt-2 text-[11px] font-bold uppercase tracking-widest text-faint">
                Unread
              </p>
              {unreadRows.map((r) => <RowItem key={r.id} r={r} />)}
              <div className="mx-4 my-1 h-px bg-border/50" />
            </>
          )}

          {/* Read / all-other conversations */}
          {otherRows.length > 0 && (
            <>
              {unreadRows.length > 0 && (
                <p className="px-4 pb-1 pt-2 text-[11px] font-bold uppercase tracking-widest text-faint">
                  Messages
                </p>
              )}
              {otherRows.map((r) => <RowItem key={r.id} r={r} />)}
            </>
          )}
        </div>
      )}

      {/* Long-press action menu */}
      {menuRow && (
        <BottomSheet open onClose={() => setMenuRow(null)} title={menuRow.name}>
          <div className="flex flex-col pb-3">
            <button type="button" disabled={actionBusy} onClick={() => togglePin(menuRow)}
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm hover:bg-white/5 disabled:opacity-60">
              {menuRow.pinned ? <PinOff size={18} className="text-muted" /> : <Pin size={18} className="text-muted" />}
              {menuRow.pinned ? "Unpin" : "Pin to top"}
            </button>
            <button type="button" disabled={actionBusy} onClick={() => toggleMute(menuRow)}
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm hover:bg-white/5 disabled:opacity-60">
              {menuRow.muted ? <Bell size={18} className="text-muted" /> : <BellOff size={18} className="text-muted" />}
              {menuRow.muted ? "Unmute" : "Mute"}
            </button>
            <button type="button" disabled={actionBusy} onClick={() => deleteChat(menuRow)}
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-red-400 hover:bg-white/5 disabled:opacity-60">
              {actionBusy ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
              {menuRow.isGroup ? "Leave group" : "Delete chat"}
            </button>
          </div>
        </BottomSheet>
      )}
    </>
  );
}
