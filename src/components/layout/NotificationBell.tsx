"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/** Bell icon with a live unread badge driven by realtime notifications. */
export function NotificationBell({ userId, initialUnread }: { userId: string; initialUnread: number }) {
  const supabase = createClient();
  const [unread, setUnread] = useState(initialUnread);

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
        () => setUnread((n) => n + 1))
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
      <Bell size={22} strokeWidth={2.2} />
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-ink ring-2 ring-background">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}
