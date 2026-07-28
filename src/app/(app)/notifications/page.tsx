"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { PushNudge } from "@/components/pwa/PushNudge";
import { PullToRefresh } from "@/components/ui/PullToRefresh";
import { EmptyState } from "@/components/ui/EmptyState";
import { Avatar } from "@/components/ui/Avatar";
import { haptics } from "@/lib/haptics";

type Notif = {
  id: string;
  type: string;
  target_type: string | null;
  target_id: string | null;
  actor_id: string | null;
  body: string | null;
  is_read: boolean;
  created_at: string;
  actor: {
    display_name: string | null;
    username: string | null;
    avatar_hue: number | null;
    avatar_url: string | null;
  } | null;
  thumb?: { url: string; isVideo: boolean } | null;
};

/** One or more notifications collapsed into a single row (same type + target). */
type Group = {
  key: string;
  type: string;
  ids: string[];
  actors: NonNullable<Notif["actor"]>[];
  actorCount: number; // distinct actors, may exceed actors.length (cap for the stack)
  body: string;
  isRead: boolean;
  latestAt: string;
  thumb: Notif["thumb"];
  href: string;
  /** Actor id of the first notification — for actionable types (follow_request) */
  actorId: string | null;
};

type Filter = "All" | "Hypes" | "Comments" | "Follows" | "Mentions";

const FILTERS: Filter[] = ["All", "Hypes", "Comments", "Follows", "Mentions"];

const TYPE_MAP: Record<Filter, string[]> = {
  All: [],
  Hypes: ["hype_post", "hype_shot", "hype_comment", "repost"],
  Comments: ["comment_post", "comment_shot", "comment_reply"],
  Follows: ["follow"],
  Mentions: ["mention_post"],
};

/** Types where bundling several rows into one loses information the user needs
 *  to act on individually — never collapse these. */
const NEVER_GROUP = new Set(["incoming_call", "new_message", "dm_post_shared", "follow_request"]);

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function notifHref(n: Notif): string {
  if (
    n.type === "follow" || n.type === "referral_joined" || n.type === "note_reaction" ||
    n.type === "follow_request" || n.type === "follow_accepted"
  )
    return n.actor?.username ? `/u/${n.actor.username}` : "#";
  if (n.type === "incoming_call" || n.type === "missed_call") return "/calls";
  if (n.target_type === "post" && n.target_id) return `/p/${n.target_id}`;
  if (n.target_type === "shot" && n.target_id) return `/shots/${n.target_id}`;
  if (n.target_type === "conversation" && n.target_id) return `/messages/${n.target_id}`;
  return "#";
}

/**
 * Collapse consecutive notifications that share the same (type, target) into
 * one row — e.g. five separate "hyped your post" rows on the same post become
 * "Aman and 4 others hyped your post". Calls, DMs, and shares stay singleton
 * since each is individually actionable. Input must already be sorted newest
 * first; group order follows first-seen (= most recent) order.
 */
function groupNotifs(list: Notif[]): Group[] {
  const order: string[] = [];
  const byKey = new Map<string, Group & { seenActorIds: Set<string> }>();

  for (const n of list) {
    const groupable = !NEVER_GROUP.has(n.type) && n.target_id;
    const key = groupable ? `${n.type}|${n.target_type}|${n.target_id}` : `solo-${n.id}`;

    let g = byKey.get(key);
    if (!g) {
      g = {
        key,
        type: n.type,
        ids: [],
        actors: [],
        actorCount: 0,
        body: n.body ?? "interacted with your content",
        isRead: true,
        latestAt: n.created_at,
        thumb: n.thumb ?? null,
        href: notifHref(n),
        actorId: n.actor_id ?? null,
        seenActorIds: new Set(),
      };
      byKey.set(key, g);
      order.push(key);
    }

    g.ids.push(n.id);
    if (!n.is_read) g.isRead = false;
    if (!g.thumb && n.thumb) g.thumb = n.thumb;

    const actorId = n.actor?.username ?? n.actor?.display_name ?? `anon-${n.id}`;
    if (!g.seenActorIds.has(actorId)) {
      g.seenActorIds.add(actorId);
      g.actorCount += 1;
      if (g.actors.length < 3 && n.actor) g.actors.push(n.actor);
    }
  }

  return order.map((k) => {
    const { seenActorIds: _drop, ...g } = byKey.get(k)!;
    return g;
  });
}

/** "Aman", "Aman and Leo", or "Aman and 4 others" */
function actorSummary(g: Group): string {
  const names = g.actors.map((a) => a.display_name ?? a.username ?? "Someone");
  if (g.actorCount <= 1) return names[0] ?? "Someone";
  if (g.actorCount === 2) return `${names[0]} and ${names[1] ?? "1 other"}`;
  return `${names[0]} and ${g.actorCount - 1} others`;
}

export default function NotificationsPage() {
  const supabase = createClient();
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [filter, setFilter] = useState<Filter>("All");
  const sentinelRef = useRef<HTMLDivElement>(null);
  const PAGE = 50;

  async function withThumbs(list: Notif[]): Promise<Notif[]> {
    const postIds = list.filter((n) => n.target_type === "post" && n.target_id).map((n) => n.target_id!);
    const shotIds = list.filter((n) => n.target_type === "shot" && n.target_id).map((n) => n.target_id!);
    const showIds = list.filter((n) => n.target_type === "show" && n.target_id).map((n) => n.target_id!);

    const [postsRes, shotsRes, showsRes] = await Promise.all([
      postIds.length ? supabase.from("posts").select("id, image_url, image_urls").in("id", postIds) : Promise.resolve({ data: [] as any[] }),
      shotIds.length ? supabase.from("shots").select("id, media_url").in("id", shotIds) : Promise.resolve({ data: [] as any[] }),
      showIds.length ? supabase.from("shows").select("id, media_url").in("id", showIds) : Promise.resolve({ data: [] as any[] }),
    ]);

    const postMap = new Map((postsRes.data ?? []).map((p: any) => [p.id, p.image_urls?.[0] ?? p.image_url ?? null]));
    const shotMap = new Map((shotsRes.data ?? []).map((s: any) => [s.id, s.media_url ?? null]));
    const showMap = new Map((showsRes.data ?? []).map((s: any) => [s.id, s.media_url ?? null]));

    return list.map((n) => {
      if (n.target_type === "post" && n.target_id && postMap.get(n.target_id)) {
        return { ...n, thumb: { url: postMap.get(n.target_id)!, isVideo: false } };
      }
      if (n.target_type === "shot" && n.target_id && shotMap.get(n.target_id)) {
        return { ...n, thumb: { url: shotMap.get(n.target_id)!, isVideo: true } };
      }
      if (n.target_type === "show" && n.target_id && showMap.get(n.target_id)) {
        return { ...n, thumb: { url: showMap.get(n.target_id)!, isVideo: false } };
      }
      return n;
    });
  }

  // `silent` skips the skeleton — used by pull-to-refresh so the list just
  // swaps in place instead of flashing empty.
  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data } = await supabase
      .from("notifications")
      .select("id, type, target_type, target_id, actor_id, body, is_read, created_at, actor:actor_id(display_name, username, avatar_hue, avatar_url)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(PAGE);

    const mapped: Notif[] = (data ?? []).map((n: any) => ({
      ...n,
      actor: Array.isArray(n.actor) ? n.actor[0] ?? null : n.actor,
    }));
    const withT = await withThumbs(mapped);
    setNotifs(withT);
    setHasMore(mapped.length === PAGE);
    setLoading(false);

    // Mark all as read (RPC fires the UPDATE that clears the TopBar badge)
    await supabase.rpc("mark_notifications_read");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

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
            let actor = null;
            if (n.actor_id) {
              const { data } = await supabase
                .from("profiles")
                .select("display_name, username, avatar_hue, avatar_url")
                .eq("id", n.actor_id)
                .maybeSingle();
              actor = data ?? null;
            }
            const [withThumb] = await withThumbs([{ ...n, actor } as Notif]);
            setNotifs((prev) => [withThumb, ...prev]);
          },
        )
        .subscribe();
    });
    return () => { if (channel) supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Infinite scroll: load older notifications when sentinel enters view
  useEffect(() => {
    if (!hasMore || loading) return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting || loadingMore) return;
      setLoadingMore(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoadingMore(false); return; }
      const oldest = notifs[notifs.length - 1]?.created_at;
      if (!oldest) { setLoadingMore(false); return; }
      const { data } = await supabase
        .from("notifications")
        .select("id, type, target_type, target_id, actor_id, body, is_read, created_at, actor:actor_id(display_name, username, avatar_hue, avatar_url)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .lt("created_at", oldest)
        .limit(PAGE);
      const mapped: Notif[] = (data ?? []).map((n: any) => ({ ...n, actor: Array.isArray(n.actor) ? n.actor[0] ?? null : n.actor }));
      const withT = await withThumbs(mapped);
      setNotifs((prev) => [...prev, ...withT]);
      setHasMore(mapped.length === PAGE);
      setLoadingMore(false);
    }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loading, loadingMore, notifs]);

  const allowed = TYPE_MAP[filter];
  const visible = allowed.length === 0 ? notifs : notifs.filter((n) => allowed.includes(n.type));
  const groups = useMemo(() => groupNotifs(visible), [visible]);

  async function clearGroup(ids: string[]) {
    haptics.tap();
    setNotifs((prev) => prev.filter((n) => !ids.includes(n.id)));
    const { error } = await supabase.from("notifications").delete().in("id", ids);
    if (error) {
      // Extremely unlikely (RLS already verified), but don't silently lose data.
      window.location.reload();
    }
  }

  // Approve/deny a private-account follow request straight from its row. The
  // RPC removes the follow_request notification server-side, so we just drop it
  // from local state (no separate delete).
  async function resolveRequest(g: Group, approve: boolean) {
    if (!g.actorId) return;
    haptics.tap();
    setNotifs((prev) => prev.filter((n) => !g.ids.includes(n.id)));
    await supabase.rpc(approve ? "approve_follow_request" : "deny_follow_request", { p_requester: g.actorId });
  }

  return (
    <>
      <PageHeader title="Notifications" showBack />

      <PushNudge />

      <PullToRefresh onRefresh={() => load({ silent: true })}>
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
        /* Shimmer skeleton rows shaped like real notifications */
        <div className="flex flex-col gap-1 px-4 pt-1">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-2.5">
              <div className="skeleton h-11 w-11 shrink-0 rounded-[30%]" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="skeleton h-3 rounded" style={{ width: `${55 + (i % 3) * 12}%` }} />
                <div className="skeleton h-2.5 w-16 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="Quiet for now"
          text="Hypes, replies, follows, and mentions will show up here."
        />
      ) : (
        <div className="flex flex-col pb-4">
          {groups.map((g, i) => (
            <NotifRow
              key={g.key}
              group={g}
              index={i}
              onClear={() => clearGroup(g.ids)}
              onResolveRequest={(approve) => resolveRequest(g, approve)}
            />
          ))}
          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="py-2 flex justify-center">
            {loadingMore && <Loader2 size={18} className="animate-spin text-faint" />}
          </div>
        </div>
      )}
      </PullToRefresh>
    </>
  );
}

const SWIPE_REVEAL = 80; // px of delete affordance revealed — matches the button's w-20
const SWIPE_COMMIT = 110; // px drag distance that commits the clear

/** One notification row (single or grouped). Swipe left to reveal + confirm clear. */
function NotifRow({ group: g, index = 0, onClear, onResolveRequest }: { group: Group; index?: number; onClear: () => void; onResolveRequest?: (approve: boolean) => void }) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const startX = useRef<number | null>(null);
  const startDragX = useRef(0);

  function onTouchStart(e: React.TouchEvent) {
    startX.current = e.touches[0].clientX;
    startDragX.current = dragX;
    setDragging(true);
  }
  function onTouchMove(e: React.TouchEvent) {
    if (startX.current === null) return;
    const dx = e.touches[0].clientX - startX.current;
    const next = Math.max(-SWIPE_COMMIT - 20, Math.min(0, startDragX.current + dx));
    setDragX(next);
  }
  function onTouchEnd() {
    setDragging(false);
    startX.current = null;
    if (dragX <= -SWIPE_COMMIT) {
      setLeaving(true);
      setDragX(-400);
      setTimeout(onClear, 200);
    } else if (dragX <= -SWIPE_REVEAL / 2) {
      setDragX(-SWIPE_REVEAL); // settle open
    } else {
      setDragX(0); // spring back closed
    }
  }

  const actorName = actorSummary(g);
  const showCluster = g.actors.length > 1;

  return (
    <div
      className="animate-row-in relative overflow-hidden"
      style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
    >
      {/* Delete affordance revealed behind the row */}
      <button
        type="button"
        aria-label="Clear notification"
        onClick={() => { setLeaving(true); setDragX(-400); setTimeout(onClear, 200); }}
        className="absolute inset-y-0 right-0 flex w-20 items-center justify-center bg-danger text-white"
      >
        <Trash2 size={18} />
      </button>

      <Link
        href={g.href}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={(e) => { if (dragX !== 0) e.preventDefault(); }}
        className={`relative flex items-center gap-3 bg-background px-4 py-3 transition-colors hover:bg-white/[0.03] ${
          !g.isRead ? "bg-accent/[0.04]" : ""
        }`}
        style={{
          transform: `translateX(${dragX}px)`,
          transition: dragging ? "none" : "transform 0.25s cubic-bezier(0.16,1,0.3,1)",
          opacity: leaving ? 0 : 1,
        }}
      >
        <div className="relative shrink-0">
          {showCluster ? (
            <div className="relative h-11 w-11">
              {g.actors.slice(0, 3).map((a, i) => (
                <Avatar
                  key={i}
                  name={a.display_name ?? a.username ?? "?"}
                  hue={a.avatar_hue ?? 280}
                  src={a.avatar_url ?? undefined}
                  size={i === 0 ? 34 : 22}
                  className={`absolute ring-2 ring-background ${
                    i === 0 ? "left-0 top-0 z-10" : i === 1 ? "bottom-0 right-0 z-20" : "bottom-0 left-0 z-20"
                  }`}
                />
              ))}
            </div>
          ) : (
            <Avatar
              name={actorName}
              hue={g.actors[0]?.avatar_hue ?? 280}
              src={g.actors[0]?.avatar_url ?? undefined}
              size={44}
            />
          )}
          {!g.isRead && (
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-background" />
          )}
        </div>
        <p className="min-w-0 flex-1 text-sm leading-snug">
          <span className="font-semibold">{actorName}</span>{" "}
          <span className="text-muted">{g.body}</span>{" "}
          <span className="text-xs text-faint">{timeAgo(g.latestAt)}</span>
        </p>
        {g.thumb && (
          <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-surface">
            {g.thumb.isVideo ? (
              <video src={g.thumb.url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={g.thumb.url} alt="" className="h-full w-full object-cover" />
            )}
          </div>
        )}
      </Link>

      {/* Private-account follow request — approve/deny inline */}
      {g.type === "follow_request" && onResolveRequest && (
        <div className="flex gap-2 bg-background px-4 pb-3 pl-[68px]">
          <button
            type="button"
            onClick={() => onResolveRequest(true)}
            className="flex h-9 flex-1 items-center justify-center rounded-xl bg-accent text-sm font-bold text-accent-ink transition-transform active:scale-[0.98]"
          >
            Approve
          </button>
          <button
            type="button"
            onClick={() => onResolveRequest(false)}
            className="flex h-9 flex-1 items-center justify-center rounded-xl border border-border bg-surface text-sm font-semibold text-muted transition-colors hover:text-foreground"
          >
            Deny
          </button>
        </div>
      )}
    </div>
  );
}
