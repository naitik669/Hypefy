"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, MessageCircle, Users, Check, Ban, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";

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
  isRequest: boolean;
};

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

type Tab = "all" | "unread" | "requests";

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function preview(r: InboxRow) {
  if (!r.lastAt) return r.isGroup ? "New group" : "Say hi 👋";
  const body =
    r.lastKind === "post" ? "Shared a post"
    : r.lastKind === "shot" ? "Shared a Shot"
    : r.lastBody ?? "Sent a message";
  if (r.isGroup) {
    const who = r.lastMine ? "You" : r.lastSenderName;
    return who ? `${who}: ${body}` : body;
  }
  return (r.lastMine ? "You: " : "") + body;
}

export function MessagesInbox({ rows }: { rows: InboxRow[] }) {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  // Conversations the user has just opened — clear their unread dot instantly.
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  // Optimistic request handling.
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);

  const isUnread = (r: InboxRow) => r.unread && !readIds.has(r.id);
  // A row is a live request only if still pending and not yet acted on.
  const isPendingRequest = (r: InboxRow) => r.isRequest && !approvedIds.has(r.id) && !removedIds.has(r.id);

  async function approveRequest(id: string) {
    setBusyId(id);
    const { error } = await supabase.rpc("approve_message_request", { p_conversation_id: id });
    setBusyId(null);
    if (!error) setApprovedIds((p) => new Set(p).add(id)); // moves to All
  }
  async function blockRequest(id: string) {
    setBusyId(id);
    const { error } = await supabase.rpc("block_message_request", { p_conversation_id: id });
    setBusyId(null);
    if (!error) setRemovedIds((p) => new Set(p).add(id)); // hidden
  }

  const unreadCount = rows.filter((r) => isUnread(r) && !isPendingRequest(r) && !removedIds.has(r.id)).length;
  const requestCount = rows.filter((r) => isPendingRequest(r)).length;

  const filtered = useMemo(() => {
    let list =
      tab === "unread"
        ? rows.filter((r) => r.unread && !readIds.has(r.id) && !isPendingRequest(r) && !removedIds.has(r.id))
        : tab === "requests"
          ? rows.filter((r) => isPendingRequest(r))
          : rows.filter((r) => !isPendingRequest(r) && !removedIds.has(r.id));
    const query = q.trim().toLowerCase();
    if (query) {
      list = list.filter(
        (r) => r.name.toLowerCase().includes(query) || (r.username ?? "").toLowerCase().includes(query),
      );
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, tab, q, readIds, approvedIds, removedIds]);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={MessageCircle}
        title="No messages yet"
        text="Start a DM or create a group chat."
        ctaLabel="New message"
        ctaHref="/messages/new"
      />
    );
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "all", label: "All", count: 0 },
    { key: "unread", label: "Unread", count: unreadCount },
    { key: "requests", label: "Requests", count: requestCount },
  ];

  return (
    <>
      {/* Search */}
      <div className="px-4 pt-3">
        <div className="flex h-11 items-center gap-2 rounded-pill border border-border bg-surface px-3.5 focus-within:border-accent/40">
          <Search size={17} className="shrink-0 text-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search messages"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
          />
        </div>
      </div>

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
            ? "No message requests."
            : tab === "unread"
              ? "You're all caught up."
              : "No matches."}
        </p>
      ) : (
        <div className="flex flex-col pt-1">
          {filtered.map((r) => {
            const unread = isUnread(r);
            const pending = isPendingRequest(r);
            return (
            <div key={r.id} className={pending ? "px-4 py-3" : ""}>
              <Link
                href={`/messages/${r.id}`}
                onClick={() => setReadIds((prev) => new Set(prev).add(r.id))}
                className={`flex items-center gap-3 transition-colors hover:bg-white/[0.03] ${pending ? "" : "px-4 py-3"}`}
              >
                {r.isGroup ? <GroupAvatar /> : <Avatar name={r.name} hue={r.hue} size={52} src={r.avatarUrl ?? undefined} />}
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm ${unread ? "font-bold text-foreground" : "font-semibold"}`}>
                    {r.name}
                    {r.isGroup && <span className="ml-1.5 text-xs font-normal text-faint">· {r.memberCount}</span>}
                  </p>
                  <p className={`truncate text-sm ${unread ? "font-semibold text-foreground" : "text-muted"}`}>
                    {preview(r)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  {r.lastAt && <span className="text-xs text-faint">{timeAgo(r.lastAt)}</span>}
                  {unread && !pending && <span className="h-2.5 w-2.5 rounded-full bg-accent" />}
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
          })}
        </div>
      )}
    </>
  );
}
