"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isVideoUrl } from "@/lib/video-mime";
import { CheckCheck, Loader2, Trash2, UserPlus, ShieldAlert, Sparkles, SlidersHorizontal, Trophy, BellOff } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { lockAxis } from "@/components/layout/SwipeNav";
import { PushNudge } from "@/components/pwa/PushNudge";
import { PullToRefresh } from "@/components/ui/PullToRefresh";
import { EmptyScene, ctaClass } from "@/components/empty/EmptyScene";
import { HelloArt } from "@/components/empty/scenes";
import { Avatar } from "@/components/ui/Avatar";
import { FollowButton } from "@/components/profile/FollowButton";
import { haptics } from "@/lib/haptics";
import { useToast } from "@/components/ui/ToastProvider";
import { scheduleUndoable } from "@/lib/undoable";
import { TuneSheet } from "@/components/notifications/TuneSheet";
import { InterestCard } from "@/components/notifications/InterestCard";
import { needsYou, sectionOf, spotlightDecision, type ActivityPrefs } from "@/lib/activity-prefs";
import { parsePrivateProfile } from "@/lib/profile";
import {
  actorSummary,
  groupNotifs as coreGroupNotifs,
  hasNoActor,
  MUTE_EXEMPT,
  shownNotifs,
  type NotifGroup,
} from "@hypefy/core/notif-group";
import { notifTarget, webHref } from "@hypefy/core/notif-target";

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
  thumb?: { url: string } | null;
  /**
   * Where a comment actually lives, resolved alongside the thumbnails.
   *
   * A hype_comment notification's target_id is the COMMENT, and a comment is
   * not a place you can navigate to — so these rows had nowhere to point and
   * returned "#". Carrying the parent lets them land on the post or Shot.
   */
  parent?: { kind: "post" | "shot"; id: string } | null;
};

/**
 * One or more notifications collapsed into a single row.
 *
 * The rules live in @hypefy/core/notif-group so the phone counts actors,
 * windows groups and refuses to collapse the same kinds. The one local part
 * is the destination: core answers with a PLACE, and this client turns it
 * into its own path.
 */
type Group = NotifGroup<NonNullable<Notif["actor"]>> & { href: string };


export { shownNotifs };


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
// The extension test lives in video-mime.ts, beside the table that maps
// those extensions to the types the buckets accept. This was the fourth
// copy of it — the Show viewer's delete path and the Show grid had two
// more — and a fourth list to keep in step with the bucket.

/**
 * The picture to draw in the little square beside a row, if there is one.
 *
 * Every Shot row used to come out an EMPTY box. The square held a <video>
 * whose `poster` was pinned to a transparent 1x1 — that poster is there to
 * suppress Android's grey play-circle, but a <video> shows its poster INSTEAD
 * of a frame until it plays, so pinning a blank one guaranteed a blank square.
 * The Shot's own cover was never even fetched, though it had one.
 *
 * So this returns a still and only a still. A Shot with no cover returns
 * nothing at all, and the row simply has no square — which is what a text
 * post with no picture already does, and is better than a hole. The other way
 * out, a posterless <video> seeked to a frame, would bring that grey
 * play-circle back on every Android row (see src/lib/blank-poster.ts).
 *
 * Exported for tests.
 */
export function mediaThumb(
  row: { media_url?: string | null; poster_url?: string | null } | null | undefined,
): { url: string } | null {
  if (!row) return null;
  if (row.poster_url) return { url: row.poster_url };
  // A Show posted before 0213 has no poster and may be either, so the
  // file extension is all there is to go on.
  if (row.media_url && !isVideoUrl(row.media_url)) return { url: row.media_url };
  return null;
}

export function notifHref(n: Notif): string {
  return webHref(notifTarget(n));
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
/**
 * Collapsed rows, each with this client's own path for the place core named.
 */
export function groupNotifs(list: Notif[]): Group[] {
  return coreGroupNotifs<Notif, NonNullable<Notif["actor"]>>(list).map((g) => ({
    ...g,
    href: webHref(g.target),
  }));
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
      shotIds.length ? supabase.from("shots").select("id, media_url, poster_url").in("id", shotIds) : Promise.resolve({ data: [] as any[] }),
      // poster_url as well as media_url. mediaThumb prefers the poster and
      // Shows have had one since 0213 — as the comment above says — but
      // this select stopped at media_url, so the poster was never fetched
      // and every video Show rendered an empty square. Found while porting
      // Activity to the phone, which asks for both.
      showIds.length ? supabase.from("shows").select("id, media_url, poster_url").in("id", showIds) : Promise.resolve({ data: [] as any[] }),
      commentIds.length ? supabase.from("comments").select("id, post_id, shot_id").in("id", commentIds) : Promise.resolve({ data: [] as any[] }),
    ]);

    const postMap = new Map((postsRes.data ?? []).map((p: any) => [p.id, p.image_urls?.[0] ?? p.image_url ?? null]));
    const shotMap = new Map((shotsRes.data ?? []).map((s: any) => [s.id, mediaThumb(s)]));
    const showMap = new Map((showsRes.data ?? []).map((s: any) => [s.id, mediaThumb(s)]));
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
        return { ...n, thumb: { url: postMap.get(n.target_id)! } };
      }
      if (n.target_type === "shot" && n.target_id && shotMap.get(n.target_id)) {
        return { ...n, thumb: shotMap.get(n.target_id)! };
      }
      if (n.target_type === "show" && n.target_id && showMap.get(n.target_id)) {
        return { ...n, thumb: showMap.get(n.target_id)! };
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
      supabase.rpc("my_private_profile"),
    ]);
    setPrefs((parsePrivateProfile(me)?.notifPrefs ?? {}) as ActivityPrefs);

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
    // Leaving the page before getUser() resolves used to leak the channel:
    // cleanup ran while `channel` was still null, and the subscribe happened
    // afterwards with nothing left to tear it down. Open and leave the page a
    // few times and the socket carries that many dead subscriptions.
    let cancelled = false;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user || cancelled) return;
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
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
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

  function clearGroup(g: Group) {
    haptics.tap();
    const ids = g.ids;
    const cleared = notifs.filter((n) => ids.includes(n.id));
    setNotifs((prev) => prev.filter((n) => !ids.includes(n.id)));
    // Held for five seconds so Undo can stop it; a cleared row is deleted.
    const cancel = scheduleUndoable(async () => {
      const { error } = await supabase.from("notifications").delete().in("id", ids);
      if (error) {
        // Extremely unlikely (RLS already verified), but don't silently lose data.
        window.location.reload();
      }
    });
    const who = g.actors[0];
    showToast("Notification cleared", "plain", {
      label: "Undo",
      detail: `${actorSummary(g)} ${g.body}`,
      thumb: { src: who?.avatar_url ?? null, name: who?.display_name ?? who?.username ?? "Hypefy", hue: who?.avatar_hue ?? null },
      onClick: () => {
        cancel();
        setNotifs((prev) =>
          [...prev.filter((n) => !ids.includes(n.id)), ...cleared].sort((a, b) => b.created_at.localeCompare(a.created_at)),
        );
      },
    });
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
        <EmptyScene
          art={<HelloArt />}
          title="Hello? …hello?"
          mark=""
          text="Post something to get hypes."
          // The phone buzzes and calls out first; the words wait for the
          // first round of echoes.
          timing={{ head: 2.7, sub: 2.85, cta: 3.5 }}
          cta={
            <Link href="/create/post" className={ctaClass}>
              Make a post
            </Link>
          }
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
                    onClear={() => clearGroup(g)}
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
                    onClear={() => clearGroup(g)}
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

/**
 * How far a row has been dragged, given the finger's travel. Never past the
 * far end, never to the right of home: the actions live on the left.
 * Exported for tests.
 */
export function swipeTo(dx: number, from: number, limit: number): number {
  return Math.max(-limit - 20, Math.min(0, from + dx));
}

/**
 * Where a row settles when the finger lifts: cleared if it was carried past
 * everything revealed, open at the actions if it was pulled most of the way
 * to them, and home otherwise. Clearing is the one that cannot be undone, so
 * it asks for the whole distance rather than a flick. Exported for tests.
 */
export function settleTo(x: number, reveal: number, commitAt: number): "clear" | "open" | "closed" {
  if (x <= -commitAt) return "clear";
  if (x <= -reveal / 2) return "open";
  return "closed";
}

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
  const startY = useRef(0);
  const startDragX = useRef(0);
  /**
   * Which way this touch is going: sideways is the row's, up and down is the
   * list's, and null until it is clear. Without it the row followed every
   * finger, so reading down Activity dragged rows open under the thumb, and a
   * swipe for the options scrolled the list at the same time.
   */
  const axis = useRef<null | "x" | "y">(null);
  const row = useRef<HTMLAnchorElement | null>(null);

  // Once the gesture is the row's, the browser's scroll is cancelled for the
  // rest of it. Native and non-passive: React's own touch handlers cannot.
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const onMove = (e: TouchEvent) => {
      if (axis.current !== "x" || !e.cancelable) return;
      e.preventDefault();
    };
    el.addEventListener("touchmove", onMove, { passive: false });
    return () => el.removeEventListener("touchmove", onMove);
  }, []);

  function onTouchStart(e: React.TouchEvent) {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    startDragX.current = dragX;
    axis.current = null;
    setDragging(true);
  }
  function onTouchMove(e: React.TouchEvent) {
    if (startX.current === null) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;
    if (axis.current === null) axis.current = lockAxis(dx, dy);
    // Still ambiguous, or the list's: leave the row where it is.
    if (axis.current !== "x") return;
    setDragX(swipeTo(dx, startDragX.current, commitAt));
  }
  function onTouchEnd() {
    setDragging(false);
    startX.current = null;
    // A row that never claimed the gesture settles back rather than sticking
    // half open on whatever the scroll had dragged it to.
    if (axis.current !== "x") {
      axis.current = null;
      setDragX(startDragX.current);
      return;
    }
    axis.current = null;
    const settled = settleTo(dragX, SWIPE_REVEAL, commitAt);
    if (settled === "clear") {
      setLeaving(true);
      setDragX(-400);
      setTimeout(onClear, 200);
    } else {
      setDragX(settled === "open" ? -reveal : 0);
    }
  }

  const actorName = actorSummary(g);
  const showCluster = g.actors.length > 1;
  const isFollowType = g.type === "follow" || g.type === "follow_accepted";
  /** Nobody did these: they are about your account or your work. */
  const noActor = hasNoActor(g.type);

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
        ref={row}
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
            {/* Always a still — a Shot's cover, a post's picture. A <video>
                here showed its poster rather than a frame, and the poster was
                blank, which is how every Shot row became an empty square. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img loading="lazy" decoding="async" src={g.thumb.url} alt="" className="h-full w-full object-cover" />
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
