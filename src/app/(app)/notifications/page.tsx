"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, CheckCheck, Loader2, Trash2, UserPlus, ShieldAlert, Sparkles, SlidersHorizontal, Trophy, BellOff } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { PushNudge } from "@/components/pwa/PushNudge";
import { PullToRefresh } from "@/components/ui/PullToRefresh";
import { EmptyState } from "@/components/ui/EmptyState";
import { Avatar } from "@/components/ui/Avatar";
import { FollowButton } from "@/components/profile/FollowButton";
import { haptics } from "@/lib/haptics";
import { useToast } from "@/components/ui/ToastProvider";
import { BLANK_POSTER } from "@/lib/blank-poster";
import { TuneSheet } from "@/components/notifications/TuneSheet";
import { InterestCard } from "@/components/notifications/InterestCard";
import { levelOf, needsYou, sectionOf, spotlightDecision, type ActivityPrefs, type LevelKey } from "@/lib/activity-prefs";

export type Notif = {
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
  /**
   * Where a comment actually lives, resolved alongside the thumbnails.
   *
   * A hype_comment notification's target_id is the COMMENT, and a comment is
   * not a place you can navigate to — so these rows had nowhere to point and
   * returned "#". Carrying the parent lets them land on the post or Shot.
   */
  parent?: { kind: "post" | "shot"; id: string } | null;
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


/** Kept when muting someone: not "activity", and not something to miss. */
const MUTE_EXEMPT = new Set(["new_message", "dm_post_shared", "incoming_call", "missed_call", "follow_request", "security_alert"]);

/** Which Tune level a notification answers to, as the server decides it. */
function levelKeyOf(type: string): LevelKey | null {
  if (type.startsWith("hype_") || type === "repost") return "hypes";
  if (type.startsWith("comment_")) return "comments";
  if (type.startsWith("mention_")) return "mentions";
  if (type === "follow" || type === "follow_accepted") return "follows";
  if (type === "dm_post_shared") return "shares";
  return null;
}

/**
 * What Activity shows, given the Tune sheet. The server already keeps new
 * rows out; this hides the ones that arrived before a change, so switching
 * something off takes effect on screen at once. Spotlight pages wait for an
 * answer: until then the newest one is only the example the question uses.
 */
export function shownNotifs(list: Notif[], prefs: ActivityPrefs): Notif[] {
  const muted = new Set(prefs.muted ?? []);
  const spotlight = spotlightDecision(prefs);
  return list.filter((n) => {
    if (n.actor_id && muted.has(n.actor_id) && !MUTE_EXEMPT.has(n.type)) return false;
    if (n.type === "spotlight_page" && spotlight !== "yes") return false;
    if (n.type === "milestone" && prefs.milestones === false) return false;
    if (n.type === "show_posted" && prefs.shows_posted === false) return false;
    if (n.type === "back_after" && prefs.back_after === false) return false;
    const key = levelKeyOf(n.type);
    return !key || levelOf(prefs, key) !== "off";
  });
}

/** Types where bundling several rows into one loses information the user needs
 *  to act on individually — never collapse these. */
const NEVER_GROUP = new Set([
  "incoming_call",
  "new_message",
  "dm_post_shared",
  "follow_request",
  // Every sign-in is its own event. Collapsing two into "1 other" hides the
  // one you didn't make, which is the entire point of the alert.
  "security_alert",
  "trial_reminder",
  // "Passed 100" and "passed 500" are two pieces of news.
  "milestone",
]);

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/**
 * Where tapping a notification should take you.
 *
 * Every row renders as a full-width Link with hover styling, so a "#" is not
 * a no-op the reader can detect — it looks tappable and simply does nothing.
 * Three types were landing there, and two more were landing somewhere
 * unhelpful:
 *
 *  - hype_comment targets a COMMENT, which is not a destination. Resolved to
 *    its post or Shot in withThumbs.
 *  - hype_shot on a Show had no branch at all, despite the thumbnail already
 *    being fetched for it.
 *  - Call notifications went to the generic /calls list while holding the
 *    conversation id they should have opened.
 *  - "reacted to your status" went to the REACTOR's profile rather than to
 *    your own, where the status they reacted to actually is.
 */
export function notifHref(n: Notif): string {
  // A security alert has no actor and no target — it is about the account
  // itself, so it opens the page where you can act on it.
  if (n.type === "security_alert") return "/settings/security";
  // About your own plan, from Hypefy rather than a person.
  if (n.type === "trial_reminder") return "/settings/subscription";

  // A reaction to your Diary opens the Diary page, where yours is. It used to
  // open your profile, back when the same note was a status bubble there —
  // which is switched off, so that link now lands on nothing.
  if (n.type === "note_reaction") return "/messages/diary";

  // Opens Spotlight on that friend's page.
  if (n.type === "spotlight_page")
    return n.target_id ? `/messages/spotlight?page=${n.target_id}` : "/messages/spotlight";

  if (
    n.type === "follow" || n.type === "referral_joined" ||
    n.type === "follow_request" || n.type === "follow_accepted"
  )
    return n.actor?.username ? `/u/${n.actor.username}` : "#";

  // The conversation is the point of a call notification; the log is not.
  if (n.type === "incoming_call" || n.type === "missed_call")
    return n.target_id ? `/messages/${n.target_id}` : "/calls";

  if (n.target_type === "post" && n.target_id) return `/p/${n.target_id}`;
  if (n.target_type === "shot" && n.target_id) return `/shots/${n.target_id}`;
  if (n.target_type === "show" && n.target_id) return `/shows/${n.target_id}`;
  if (n.target_type === "conversation" && n.target_id) return `/messages/${n.target_id}`;
  if (n.target_type === "comment" && n.parent)
    return n.parent.kind === "post"
      ? // Land on the comment itself, not just the post it is on. The post
        // page opens the thread and scrolls to it.
        `/p/${n.parent.id}?comment=${n.target_id}`
      : `/shots/${n.parent.id}`;
  return "#";
}

/**
 * Collapse consecutive notifications that share the same (type, target) into
 * one row — e.g. five separate "hyped your post" rows on the same post become
 * "Aman and 4 others hyped your post". Calls, DMs, and shares stay singleton
 * since each is individually actionable. Input must already be sorted newest
 * first; group order follows first-seen (= most recent) order.
 *
 * A group only spans GROUP_WINDOW_MS from its newest item. Follows all share
 * one target (you), so without a window a follow today was summed with every
 * follow ever: "Aman and 5 others followed you", the five from a month ago.
 * Older ones start a group of their own further down.
 */
const GROUP_WINDOW_MS = 24 * 60 * 60 * 1000;

export function groupNotifs(list: Notif[]): Group[] {
  const order: string[] = [];
  /** The open group for each kind of notification: the newest one. */
  const byKey = new Map<string, Group & { seenActorIds: Set<string> }>();
  const groups = new Map<string, Group & { seenActorIds: Set<string> }>();

  for (const n of list) {
    const groupable = !NEVER_GROUP.has(n.type) && n.target_id;
    const kind = groupable ? `${n.type}|${n.target_type}|${n.target_id}` : `solo-${n.id}`;

    let g = byKey.get(kind);
    const at = new Date(n.created_at).getTime();
    if (g && new Date(g.latestAt).getTime() - at > GROUP_WINDOW_MS) g = undefined;
    if (!g) {
      const key = order.includes(kind) ? `${kind}#${n.id}` : kind;
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
      byKey.set(kind, g);
      order.push(key);
      groups.set(key, g);
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
    const { seenActorIds: _drop, ...g } = groups.get(k)!;
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
  const showToast = useToast();
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  /** The Tune sheet's choices, mirrored so the screen matches the server. */
  const [prefs, setPrefs] = useState<ActivityPrefs>({});
  const [tuneOpen, setTuneOpen] = useState(false);
  /** Answered the Spotlight question on this visit: keeps the card, with Undo. */
  const [answered, setAnswered] = useState<"yes" | "no" | null>(null);
  /** Actors I already follow — decides whether a follow row offers "Follow
   *  back" or just says who followed me. */
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const sentinelRef = useRef<HTMLDivElement>(null);
  const PAGE = 50;

  async function withThumbs(list: Notif[]): Promise<Notif[]> {
    const postIds = list.filter((n) => n.target_type === "post" && n.target_id).map((n) => n.target_id!);
    const shotIds = list.filter((n) => n.target_type === "shot" && n.target_id).map((n) => n.target_id!);
    const showIds = list.filter((n) => n.target_type === "show" && n.target_id).map((n) => n.target_id!);
    // A comment is not somewhere you can go, so these rows need their parent
    // resolved before they can link anywhere at all.
    const commentIds = list.filter((n) => n.target_type === "comment" && n.target_id).map((n) => n.target_id!);

    const [postsRes, shotsRes, showsRes, commentsRes] = await Promise.all([
      postIds.length ? supabase.from("posts").select("id, image_url, image_urls").in("id", postIds) : Promise.resolve({ data: [] as any[] }),
      shotIds.length ? supabase.from("shots").select("id, media_url").in("id", shotIds) : Promise.resolve({ data: [] as any[] }),
      showIds.length ? supabase.from("shows").select("id, media_url").in("id", showIds) : Promise.resolve({ data: [] as any[] }),
      commentIds.length ? supabase.from("comments").select("id, post_id, shot_id").in("id", commentIds) : Promise.resolve({ data: [] as any[] }),
    ]);

    const postMap = new Map((postsRes.data ?? []).map((p: any) => [p.id, p.image_urls?.[0] ?? p.image_url ?? null]));
    const shotMap = new Map((shotsRes.data ?? []).map((s: any) => [s.id, s.media_url ?? null]));
    const showMap = new Map((showsRes.data ?? []).map((s: any) => [s.id, s.media_url ?? null]));
    const parentMap = new Map<string, { kind: "post" | "shot"; id: string }>(
      (commentsRes.data ?? [])
        .map((c: any) =>
          c.post_id
            ? [c.id, { kind: "post" as const, id: c.post_id }]
            : c.shot_id
              ? [c.id, { kind: "shot" as const, id: c.shot_id }]
              : null,
        )
        .filter(Boolean) as [string, { kind: "post" | "shot"; id: string }][],
    );

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
      if (n.target_type === "comment" && n.target_id) {
        return { ...n, parent: parentMap.get(n.target_id) ?? null };
      }
      return n;
    });
  }

  /** One query for the whole page rather than one per row. */
  const loadFollowState = useCallback(async (list: Notif[], myId: string) => {
    const ids = [...new Set(
      list.filter((n) => n.type === "follow" || n.type === "follow_accepted")
          .map((n) => n.actor_id)
          .filter(Boolean) as string[],
    )];
    if (ids.length === 0) return;
    const { data } = await supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", myId)
      .in("following_id", ids);
    setFollowingIds((prev) => {
      const next = new Set(prev);
      (data ?? []).forEach((f) => next.add(f.following_id));
      return next;
    });
  }, [supabase]);

  // `silent` skips the skeleton — used by pull-to-refresh so the list just
  // swaps in place instead of flashing empty.
  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const [{ data }, { data: me }] = await Promise.all([
      supabase
        .from("notifications")
        .select("id, type, target_type, target_id, actor_id, body, is_read, created_at, actor:actor_id(display_name, username, avatar_hue, avatar_url)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(PAGE),
      supabase.from("profiles").select("notif_prefs").eq("id", user.id).maybeSingle(),
    ]);
    setPrefs(((me as { notif_prefs?: ActivityPrefs } | null)?.notif_prefs ?? {}) as ActivityPrefs);

    const mapped: Notif[] = (data ?? []).map((n: any) => ({
      ...n,
      actor: Array.isArray(n.actor) ? n.actor[0] ?? null : n.actor,
    }));
    const withT = await withThumbs(mapped);
    setNotifs(withT);
    setHasMore(mapped.length === PAGE);
    setLoading(false);
    void loadFollowState(withT, user.id);

    // Mark as read — but only what was actually fetched.
    //
    // This used to call mark_notifications_read(), which takes no arguments
    // and clears EVERY notification on the account, including everything past
    // this page's limit that was never fetched, never rendered and never seen.
    // Open Activity once with 300 unread and 250 of them were silently marked
    // read; pull-to-refresh did it again.
    //
    // Scoped to the loaded ids, the badge still clears for what you have in
    // front of you, and anything below the fold survives until you page down
    // to it.
    const unreadIds = mapped.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length > 0) {
      await supabase.from("notifications").update({ is_read: true }).in("id", unreadIds);
    }
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

  /**
   * "Read all" now genuinely means all.
   *
   * It used to be purely cosmetic, because opening the page had already marked
   * every notification on the account server-side. Now that the implicit mark
   * is scoped to what you actually loaded, this button is the explicit way to
   * clear the rest — which is what its label always claimed.
   */
  async function readAll() {
    haptics.tap();
    setNotifs((prev) => prev.map((n) => (n.is_read ? n : { ...n, is_read: true })));
    const { error } = await supabase.rpc("mark_notifications_read");
    if (error) showToast("Couldn't mark everything read.");
  }

  const spotlight = spotlightDecision(prefs);
  const visible = useMemo(() => shownNotifs(notifs, prefs), [notifs, prefs]);
  const groups = useMemo(() => groupNotifs(visible), [visible]);
  // What needs an answer first, then the rest by when it happened.
  const needs = groups.filter((g) => needsYou(g.type, g.isRead));
  const rest = groups.filter((g) => !needsYou(g.type, g.isRead));
  const sections = (["today", "week", "earlier"] as const).map((key) => ({
    key,
    label: key === "today" ? "Today" : key === "week" ? "This week" : "Earlier",
    groups: rest.filter((g) => sectionOf(g.latestAt) === key),
  }));
  // The Spotlight question is asked with a real example, the newest such page,
  // at the top of the first section there is (Today when there is one).
  const askWith = notifs.find((n) => n.type === "spotlight_page") ?? null;
  const showAsk = !!askWith && (spotlight === "ask" || answered !== null);
  const askIn = sections.find((sec) => sec.groups.length)?.key ?? "today";

  async function answerSpotlight(value: boolean | null) {
    const before = prefs;
    haptics.tap();
    setAnswered(value === null ? null : value ? "yes" : "no");
    setPrefs((p) => {
      const next = { ...p };
      if (value === null) delete next.spotlight_pages;
      else next.spotlight_pages = value;
      return next;
    });
    const { error } = await supabase.rpc("set_activity_pref", { p_key: "spotlight_pages", p_value: value as never });
    if (error) {
      setPrefs(before);
      setAnswered(null);
      showToast("Couldn't save that. Try again.");
    }
  }

  async function muteActor(g: Group) {
    const id = g.actorId;
    if (!id) return;
    haptics.tap();
    const before = { notifs, prefs };
    setNotifs((prev) => prev.filter((n) => n.actor_id !== id || MUTE_EXEMPT.has(n.type)));
    setPrefs((p) => ({ ...p, muted: [...(p.muted ?? []).filter((m) => m !== id), id] }));
    const { error } = await supabase.rpc("set_activity_mute", { p_user: id, p_on: true });
    if (error) {
      setNotifs(before.notifs);
      setPrefs(before.prefs);
      showToast("Couldn't mute. Try again.");
      return;
    }
    showToast(`Muted ${actorSummary(g)}. Unmute in Tune.`);
  }

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
    const before = notifs;
    setNotifs((prev) => prev.filter((n) => !g.ids.includes(n.id)));
    const { error } = await supabase.rpc(
      approve ? "approve_follow_request" : "deny_follow_request",
      { p_requester: g.actorId },
    );
    if (error) {
      // Was silent: the row disappeared while the request stayed pending.
      setNotifs(before);
      showToast(approve ? "Couldn't approve that request." : "Couldn't deny that request.");
    }
  }

  return (
    <>
      <PageHeader
        title="Activity"
        showBack
        right={
          <>
            {groups.some((g) => !g.isRead) && (
              <button
                type="button"
                onClick={readAll}
                className="flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-xs font-bold text-accent transition-colors hover:bg-accent/10"
              >
                <CheckCheck size={15} /> Read all
              </button>
            )}
            {/* Follow requests outlive their notifications — clearing one used
                to strand the request with nowhere left to answer it. */}
            <button
              type="button"
              onClick={() => setTuneOpen(true)}
              aria-label="Tune your Activity"
              data-tune-button
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-white/5 hover:text-foreground"
            >
              <SlidersHorizontal size={18} />
            </button>
            <Link
              href="/requests"
              aria-label="Follow requests"
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-white/5 hover:text-foreground"
            >
              <UserPlus size={18} />
            </Link>
          </>
        }
      />

      <PushNudge />

      <PullToRefresh onRefresh={() => load({ silent: true })}>

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
      ) : groups.length === 0 && !showAsk ? (
        <EmptyState
          icon={Bell}
          title="Quiet for now"
          text="Hypes, replies, follows, and mentions will show up here."
        />
      ) : (
        <div className="flex flex-col pb-4 pt-1">
          {needs.length > 0 && (
            <>
              <SectionLabel>Needs you</SectionLabel>
              <div className="mx-3 overflow-hidden rounded-[18px] bg-surface" data-section="needs">
                {needs.map((g, i) => (
                  <NotifRow
                    key={g.key}
                    group={g}
                    index={i}
                    surface
                    following={!!g.actorId && followingIds.has(g.actorId)}
                    onClear={() => clearGroup(g.ids)}
                    onResolveRequest={(approve) => resolveRequest(g, approve)}
                  />
                ))}
              </div>
            </>
          )}
          {sections.map((sec) => {
            const withAsk = showAsk && sec.key === askIn;
            if (!sec.groups.length && !withAsk) return null;
            return (
              <div key={sec.key} data-section={sec.key}>
                <SectionLabel>{sec.label}</SectionLabel>
                {withAsk && askWith && (
                  <InterestCard
                    actor={askWith.actor}
                    href={notifHref(askWith)}
                    answered={answered}
                    onAnswer={(yes) => answerSpotlight(yes)}
                    onUndo={() => answerSpotlight(null)}
                  />
                )}
                {sec.groups.map((g, i) => (
                  <NotifRow
                    key={g.key}
                    group={g}
                    index={needs.length + i}
                    following={!!g.actorId && followingIds.has(g.actorId)}
                    onClear={() => clearGroup(g.ids)}
                    onMute={g.actorId && g.actors.length === 1 && !MUTE_EXEMPT.has(g.type) ? () => muteActor(g) : undefined}
                    onResolveRequest={(approve) => resolveRequest(g, approve)}
                  />
                ))}
              </div>
            );
          })}
          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="py-2 flex justify-center">
            {loadingMore && <Loader2 size={18} className="animate-spin text-faint" />}
          </div>
        </div>
      )}
      </PullToRefresh>

      <TuneSheet open={tuneOpen} onClose={() => setTuneOpen(false)} prefs={prefs} onChange={setPrefs} />
    </>
  );
}

/** "New" / "Earlier" divider above a run of rows. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-4 pb-1 pt-3 text-[11px] font-bold uppercase tracking-widest text-faint">
      {children}
    </p>
  );
}

const SWIPE_REVEAL = 80; // px per action revealed — matches each button's w-20
const SWIPE_COMMIT = 110; // px drag distance that commits the clear

/** One notification row (single or grouped). Swipe left to reveal + confirm clear. */
function NotifRow({
  group: g,
  index = 0,
  following = false,
  surface = false,
  onClear,
  onMute,
  onResolveRequest,
}: {
  group: Group;
  index?: number;
  following?: boolean;
  /** Sits on a card rather than on the page. */
  surface?: boolean;
  onClear: () => void;
  /** Mute this person in Activity: offered beside Clear. */
  onMute?: () => void;
  onResolveRequest?: (approve: boolean) => void;
}) {
  const reveal = onMute ? SWIPE_REVEAL * 2 : SWIPE_REVEAL;
  // A full swipe clears; it has to travel past everything revealed first.
  const commitAt = Math.max(SWIPE_COMMIT, reveal + 50);
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
    const next = Math.max(-commitAt - 20, Math.min(0, startDragX.current + dx));
    setDragX(next);
  }
  function onTouchEnd() {
    setDragging(false);
    startX.current = null;
    if (dragX <= -commitAt) {
      setLeaving(true);
      setDragX(-400);
      setTimeout(onClear, 200);
    } else if (dragX <= -SWIPE_REVEAL / 2) {
      setDragX(-reveal); // settle open
    } else {
      setDragX(0); // spring back closed
    }
  }

  const actorName = actorSummary(g);
  const showCluster = g.actors.length > 1;
  const isFollowType = g.type === "follow" || g.type === "follow_accepted";
  /** Nobody did these: they are about your account or your work. */
  const noActor = g.type === "security_alert" || g.type === "trial_reminder" || g.type === "milestone";

  return (
    <div
      className="animate-row-in relative overflow-hidden"
      style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
    >
      {/* Mute and clear, revealed behind the row */}
      {onMute && (
        <button
          type="button"
          aria-label="Mute notifications from this person"
          onClick={() => { setLeaving(true); setDragX(-400); setTimeout(onMute, 200); }}
          className="absolute inset-y-0 right-20 flex w-20 flex-col items-center justify-center gap-0.5 bg-elevated text-[11px] font-bold text-foreground"
        >
          <BellOff size={17} />
          Mute
        </button>
      )}
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
        className={`relative flex items-center gap-3 ${surface ? "bg-surface" : "bg-background"} py-3 pl-4 pr-4 transition-colors hover:bg-white/[0.03] ${
          !g.isRead ? "bg-accent/[0.04] before:absolute before:inset-y-1 before:left-0 before:w-[3px] before:rounded-r-full before:bg-accent before:content-['']" : ""
        }`}
        style={{
          transform: `translateX(${dragX}px)`,
          transition: dragging ? "none" : "transform 0.25s cubic-bezier(0.16,1,0.3,1)",
          opacity: leaving ? 0 : 1,
        }}
      >
        <div className="relative shrink-0">
          {g.type === "trial_reminder" ? (
            <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-accent/15 text-accent">
              <Sparkles size={22} />
            </span>
          ) : g.type === "milestone" ? (
            <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-accent/15 text-accent">
              <Trophy size={21} />
            </span>
          ) : g.type === "security_alert" ? (
            // No actor: nobody did this to you, it happened to your account.
            // A face here would be a stranger's initial next to "New sign-in",
            // which reads as an accusation of the wrong person.
            <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-danger/15 text-danger">
              <ShieldAlert size={22} />
            </span>
          ) : showCluster ? (
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
          {!noActor && (
            <>
              <span className="font-semibold">{actorName}</span>{" "}
            </>
          )}
          <span
            className={noActor ? "font-semibold" : "text-muted"}
          >
            {g.body}
          </span>{" "}
          <span className="text-xs text-faint">{timeAgo(g.latestAt)}</span>
        </p>
        {/* Follow back, without leaving the list. Only where there is nothing
            else to open — a thumbnail means the row already has a destination. */}
        {isFollowType && g.actorId && !g.thumb && (
          <span onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
            <FollowButton targetUserId={g.actorId} initialFollowing={following} variant="inline" />
          </span>
        )}
        {g.thumb && (
          <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-surface">
            {g.thumb.isVideo ? (
              <video poster={BLANK_POSTER} src={g.thumb.url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={g.thumb.url} alt="" className="h-full w-full object-cover" />
            )}
          </div>
        )}
      </Link>

      {/* Private-account follow request — approve/deny inline */}
      {g.type === "follow_request" && onResolveRequest && (
        <div className={`flex gap-2 ${surface ? "bg-surface" : "bg-background"} px-4 pb-3 pl-[68px]`}>
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
