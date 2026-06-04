"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, MessageCircle } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";

export type InboxRow = {
  id: string;
  name: string;
  username: string | null;
  hue: number;
  lastBody: string | null;
  lastKind: string | null;
  lastAt: string | null;
  lastMine: boolean;
  unread: boolean;
  isRequest: boolean;
};

type Tab = "all" | "unread" | "requests";

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function preview(r: InboxRow) {
  if (!r.lastAt) return "Say hi 👋";
  const body = r.lastKind === "post" ? "Shared a post" : r.lastBody ?? "Sent a message";
  return (r.lastMine ? "You: " : "") + body;
}

export function MessagesInbox({ rows }: { rows: InboxRow[] }) {
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");

  const unreadCount = rows.filter((r) => r.unread && !r.isRequest).length;
  const requestCount = rows.filter((r) => r.isRequest).length;

  const filtered = useMemo(() => {
    let list =
      tab === "unread"
        ? rows.filter((r) => r.unread && !r.isRequest)
        : tab === "requests"
          ? rows.filter((r) => r.isRequest)
          : rows.filter((r) => !r.isRequest);
    const query = q.trim().toLowerCase();
    if (query) {
      list = list.filter(
        (r) => r.name.toLowerCase().includes(query) || (r.username ?? "").toLowerCase().includes(query),
      );
    }
    return list;
  }, [rows, tab, q]);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={MessageCircle}
        title="No messages yet"
        text="Open someone's profile and tap Message to start a chat."
        ctaLabel="Discover people"
        ctaHref="/discover"
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
          {filtered.map((r) => (
            <Link
              key={r.id}
              href={`/messages/${r.id}`}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.03]"
            >
              <Avatar name={r.name} hue={r.hue} size={52} />
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm ${r.unread ? "font-bold text-foreground" : "font-semibold"}`}>
                  {r.name}
                </p>
                <p className={`truncate text-sm ${r.unread ? "font-semibold text-foreground" : "text-muted"}`}>
                  {preview(r)}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                {r.lastAt && <span className="text-xs text-faint">{timeAgo(r.lastAt)}</span>}
                {r.unread && <span className="h-2.5 w-2.5 rounded-full bg-accent" />}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
