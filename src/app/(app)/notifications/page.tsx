"use client";

import { useEffect, useState } from "react";
import { Bell, Loader2 } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Avatar } from "@/components/ui/Avatar";

type Notif = {
  id: string;
  type: string;
  target_type: string | null;
  target_id: string | null;
  body: string | null;
  is_read: boolean;
  created_at: string;
  actor: {
    display_name: string | null;
    username: string | null;
    avatar_hue: number | null;
    avatar_url: string | null;
  } | null;
};

type Filter = "All" | "Hypes" | "Comments" | "Follows" | "Mentions";

const FILTERS: Filter[] = ["All", "Hypes", "Comments", "Follows", "Mentions"];

const TYPE_MAP: Record<Filter, string[]> = {
  All: [],
  Hypes: ["hype_post", "hype_shot", "hype_comment", "repost"],
  Comments: ["comment_post", "comment_shot"],
  Follows: ["follow"],
  Mentions: ["mention_post", "mention_shot"],
};

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function notifHref(n: Notif): string {
  if (n.type === "follow") return n.actor?.username ? `/u/${n.actor.username}` : "#";
  if (n.target_type === "post" && n.target_id) return `/p/${n.target_id}`;
  if (n.target_type === "shot" && n.target_id) return `/shots/${n.target_id}`;
  if (n.target_type === "conversation" && n.target_id) return `/messages/${n.target_id}`;
  return "#";
}

export default function NotificationsPage() {
  const supabase = createClient();
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("All");

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data } = await supabase
        .from("notifications")
        .select("id, type, target_type, target_id, body, is_read, created_at, actor:actor_id(display_name, username, avatar_hue, avatar_url)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      const mapped: Notif[] = (data ?? []).map((n: any) => ({
        ...n,
        actor: Array.isArray(n.actor) ? n.actor[0] ?? null : n.actor,
      }));
      setNotifs(mapped);
      setLoading(false);

      // Mark all as read (RPC fires the UPDATE that clears the TopBar badge)
      await supabase.rpc("mark_notifications_read");
    }
    load();
  }, [supabase]);

  // Realtime: new notifications appear at the top without a refresh
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      channel = supabase
        .channel(`notifs-page-${user.id}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
          async (payload) => {
            const n = payload.new as any;
            // Fetch actor profile for the new row
            let actor = null;
            if (n.actor_id) {
              const { data } = await supabase
                .from("profiles")
                .select("display_name, username, avatar_hue, avatar_url")
                .eq("id", n.actor_id)
                .maybeSingle();
              actor = data ?? null;
            }
            setNotifs((prev) => [{ ...n, actor } as Notif, ...prev]);
          },
        )
        .subscribe();
    });
    return () => { if (channel) supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allowed = TYPE_MAP[filter];
  const visible = allowed.length === 0 ? notifs : notifs.filter((n) => allowed.includes(n.type));

  return (
    <>
      <PageHeader title="Notifications" showBack />

      {/* Filter pills */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-3 pt-3">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`shrink-0 rounded-pill px-4 py-1.5 text-sm font-semibold transition-colors ${
              f === filter ? "bg-accent text-accent-ink" : "bg-surface text-muted"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-muted" />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="Quiet for now"
          text="Hypes, replies, follows, and mentions will show up here."
        />
      ) : (
        <div className="flex flex-col">
          {visible.map((n) => {
            const actorName = n.actor?.display_name ?? n.actor?.username ?? "Someone";
            const hue = n.actor?.avatar_hue ?? 280;
            return (
              <Link
                key={n.id}
                href={notifHref(n)}
                className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.03] ${
                  !n.is_read ? "bg-accent/[0.04]" : ""
                }`}
              >
                <div className="relative shrink-0">
                  <Avatar name={actorName} hue={hue} size={44} src={n.actor?.avatar_url ?? undefined} />
                  {!n.is_read && (
                    <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-background" />
                  )}
                </div>
                <p className="min-w-0 flex-1 text-sm leading-snug">
                  <span className="font-semibold">{actorName}</span>{" "}
                  <span className="text-muted">{n.body ?? "interacted with your content"}</span>
                </p>
                <span className="shrink-0 text-xs text-faint">{timeAgo(n.created_at)}</span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
