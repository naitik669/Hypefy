"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const REVEAL_KEY = "hypefy:notif-badge-revealed";
const REVEAL_MS = 5000;

/** Bell icon with a live unread badge driven by realtime notifications. */
export function NotificationBell({ userId, initialUnread }: { userId: string; initialUnread: number }) {
  const supabase = createClient();
  const [unread, setUnread] = useState(initialUnread);
  // Show the actual count for a few seconds on the first home open this
  // app session, then collapse to a plain dot. sessionStorage clears when
  // the app/tab is fully closed, so it re-reveals on the next cold open.
  const [showCount, setShowCount] = useState(() => {
    if (typeof window === "undefined") return true;
    return !window.sessionStorage.getItem(REVEAL_KEY);
  });
  // Bumped on every incoming notification so the <Star> remounts and its
  // bulge animation restarts (CSS animations don't replay on their own).
  const [bulgeKey, setBulgeKey] = useState(0);

  useEffect(() => {
    if (!showCount) return;
    window.sessionStorage.setItem(REVEAL_KEY, "1");
    const t = setTimeout(() => setShowCount(false), REVEAL_MS);
    return () => clearTimeout(t);
  }, [showCount]);

  useEffect(() => {
    async function refetch() {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_read", false);
      setUnread(count ?? 0);
    }

    // Re-sync when the bar (re)mounts and when the tab regains focus — this
    // clears the badge after the user has visited the notifications page.
    refetch();
    function onFocus() { refetch(); }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    const ch = supabase
      .channel(`notif-badge:${userId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => {
          setUnread((n) => n + 1);
          setBulgeKey((k) => k + 1);
        })
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => refetch())
      .subscribe();

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      supabase.removeChannel(ch);
    };
  }, [supabase, userId]);

  return (
    <Link
      href="/notifications"
      aria-label="Notifications"
      className="relative flex h-9 w-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-white/5"
    >
      <Star key={bulgeKey} size={22} strokeWidth={2.2} className={bulgeKey > 0 ? "animate-notif-bulge" : ""} />
      {unread > 0 && (
        showCount ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-ink ring-2 ring-background transition-all">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : (
          <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-accent ring-2 ring-background transition-all" />
        )
      )}
    </Link>
  );
}
