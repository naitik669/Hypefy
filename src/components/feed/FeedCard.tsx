"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Star,
  MessageCircle,
  Bookmark,
  MoreHorizontal,
  Maximize2,
  Repeat2,
} from "lucide-react";
import { Plane } from "@/components/ui/Plane";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";
import { ZoomViewer } from "@/components/ui/ZoomViewer";
import { ExpandableText } from "@/components/ui/ExpandableText";
import { RichPostText } from "@/components/ui/RichPostText";
import { timeAgoShort } from "@/lib/time";
import { CommentsSheet } from "@/components/feed/CommentsSheet";
import { FeedImpression } from "@/components/feed/FeedImpression";
import { PostPeek } from "@/components/feed/PostPeek";
import { PinchLayer } from "@/components/feed/PinchLayer";
import { PostActionsSheet } from "@/components/feed/PostActionsSheet";
import { ShareSheet } from "@/components/feed/ShareSheet";
import { ShareButton } from "@/components/feed/QuickShare";
import { EditPostSheet } from "@/components/feed/EditPostSheet";
import { HypeParticles } from "@/components/feed/HypeParticles";
import { HypeBreak } from "@/components/feed/HypeBreak";
import { VerifiedStar } from "@/components/ui/VerifiedStar";
import { DisplayName } from "@/components/ui/DisplayName";
import { AvatarFrame } from "@/components/ui/AvatarFrame";
import { visibleDecoration } from "@/lib/cosmetics";
import { HyperStar } from "@/components/ui/HyperStar";
import { MutualHyperBadge } from "@/components/ui/MutualHyperBadge";
import { formatCount } from "@/lib/format";
import { haptics } from "@/lib/haptics";
import { OptimizedImage } from "@/components/ui/OptimizedImage";
import { feedRatio } from "@/lib/aspect";
import { useToast } from "@/components/ui/ToastProvider";
import { TrackChip } from "@/components/music/TrackChip";
import { MusicMuteButton } from "@/components/music/MusicMuteButton";
import { parseTrack } from "@/lib/music";
import { hypeResult } from "@/lib/supabase/typed";
import { PollBlock, parsePoll } from "@/components/feed/PollBlock";
import { useSaveMenus } from "@/components/saved/SaveMenus";

export type FeedPost = {
  id: string;
  user_id: string;
  caption: string | null;
  body: string | null;
  image_url: string | null;
  image_urls?: string[];
  /** width / height chosen in the composer. Null on posts made before 0035
   *  and on text-only posts — those keep rendering square, which is the shape
   *  they were actually composed and cropped at. */
  aspect_ratio?: number | null;
  hashtags: string[];
  mentions: string[];
  hype_count: number;
  comment_count: number;
  created_at: string;
  profiles: {
    id: string | null;
    display_name: string | null;
    username: string | null;
    avatar_hue: number | null;
    avatar_url?: string | null;
    profile_tags: string[] | null;
    is_verified?: boolean | null;
    is_premium?: boolean | null;
    name_font?: string | null;
    name_glow?: string | null;
    avatar_decoration?: string | null;
  } | null;
  initialHyped?: boolean;
  initialSaved?: boolean;
  /** Attached song ({id,title,artist,artwork,preview} jsonb) — see src/lib/music. */
  track?: unknown;
  /** Poll ({options: string[]} jsonb) — see PollBlock. */
  poll?: unknown;
  /** Display name of the followed user whose repost surfaced this post. */
  _repostedBy?: string | null;
};

/** Deduplicate and merge single/multi image fields */
function getImages(post: FeedPost): string[] {
  const urls = post.image_urls?.length
    ? post.image_urls
    : post.image_url
    ? [post.image_url]
    : [];
  return [...new Set(urls)];
}

/** How far a feed photo may be pinched. */
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 4;

/**
 * Pinch ratio, clamped.
 *
 * Floored at 1 rather than allowed below: shrinking the photo inside its own
 * frame leaves a gap in the card, which reads as a rendering fault rather
 * than as zooming out. Guarded against a zero starting gap, which would put
 * NaN into a transform and blank the image.
 */
export function clampZoom(ratio: number): number {
  if (!Number.isFinite(ratio)) return ZOOM_MIN;
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, ratio));
}

export function FeedCard({
  post,
  currentUserId,
  initialIsHyper,
  initialIsMutualHyper,
  focusCommentId = null,
  showId,
}: {
  post: FeedPost;
  currentUserId: string;
  /**
   * The author's live Show, if they have one.
   *
   * Their face then opens it instead of their profile — the same rule the
   * profile page's own avatar follows, and the same entry point the ring at
   * the top of the feed uses.
   */
  showId?: string;
  /** Hyper status resolved by the parent (FeedList) — skips a per-card query.
   *  Undefined for standalone cards (post page, profile viewer), which self-fetch. */
  initialIsHyper?: boolean;
  initialIsMutualHyper?: boolean;
  /**
   * Open comments on mount, landing on this one. Passed only by /p/[postId]
   * from ?comment= in the URL, so a "replied to your comment" notification
   * has somewhere to point — a comment was not a place before this.
   */
  focusCommentId?: string | null;
}) {
  const supabase = createClient();
  const images = getImages(post);

  // Resolve the current user ourselves when the parent didn't pass one,
  // so hype/save work on every surface (profile modal, search, discover...).
  const [uid, setUid] = useState(currentUserId);

  const [hyped, setHyped] = useState(post.initialHyped ?? false);
  const [hypeCount, setHypeCount] = useState(post.hype_count);
  const [hypePending, setHypePending] = useState(false);
  const [hypeBurst, setHypeBurst] = useState(false);
  const [showParticles, setShowParticles] = useState(false);
  /** Un-hyping: the star snaps in two and the halves fall. */
  const [hypeBreak, setHypeBreak] = useState(false);
  const [saveBurst, setSaveBurst] = useState(false);

  const [saved, setSaved] = useState(post.initialSaved ?? false);
  const [savePending, setSavePending] = useState(false);

  const [imgIdx, setImgIdx] = useState(0);
  // JS-controlled swipe: one image per gesture, no native scroll momentum
  /** The card itself, so an attached song plays with the post. */
  const cardRef = useRef<HTMLElement>(null);
  const galleryTouchStartX = useRef(0);
  const galleryTouchStartY = useRef(0);
  /** When the finger landed, and whether it has since moved like a scroll. */
  const galleryTouchStartAt = useRef(0);
  const galleryMoved = useRef(false);
  const galleryIsTouchEvent = useRef(false);

  /**
   * Five gestures share this one element, so the guards below ARE the design:
   *
   *   tap            → nothing (kept for the desktop click path)
   *   double-tap     → Hype
   *   swipe sideways → next / previous image
   *   hold           → peek: the photo lifts and STAYS, until tapped away
   *   pinch          → the photo lifts clear of the card and grows past its
   *                    borders; zoom and pan, springing back on release
   *
   * Hold and pinch are deliberately different answers. Holding asks "what is
   * that?" and wants the whole picture for a second; pinching asks "what is
   * in the corner of it?" and wants to steer. Sending both to the same
   * full-screen viewer, as this did, answered neither well.
   *
   * The corner expand button is gone from touch as a result — it was always
   * visible, sat on top of the photo it existed to reveal, and had to be hit
   * exactly.
   */
  const HOLD_MS = 350;
  /** Movement that means "swiping", not "holding". */
  const HOLD_SLOP_PX = 10;
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** A hold or pinch happened; the release that follows is not a tap. */
  const gestureConsumed = useRef(false);
  const [peekSrc, setPeekSrc] = useState<string | null>(null);

  /** Live pinch transform. Identity when idle, so nothing is composited. */
  const [pinch, setPinch] = useState({ scale: 1, x: 0, y: 0 });
  const [pinching, setPinching] = useState(false);
  /**
   * Where the photo was on screen when the pinch began, so the lifted copy
   * can start exactly on top of it. Null means no pinch is in flight.
   */
  const [pinchRect, setPinchRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const galleryRef = useRef<HTMLDivElement | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinchFrom = useRef<{
    dist: number;
    midX: number;
    midY: number;
  } | null>(null);

  function clearHold() {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }

  function twoFingerState(t: React.TouchList) {
    return {
      dist: Math.hypot(
        t[0].clientX - t[1].clientX,
        t[0].clientY - t[1].clientY
      ),
      midX: (t[0].clientX + t[1].clientX) / 2,
      midY: (t[0].clientY + t[1].clientY) / 2,
    };
  }

  function beginPinch(t: React.TouchList) {
    clearHold();
    setPeekSrc(null);
    gestureConsumed.current = true;
    if (settleTimer.current) {
      clearTimeout(settleTimer.current);
      settleTimer.current = null;
    }
    const box = galleryRef.current?.getBoundingClientRect();
    if (box) {
      setPinchRect({
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
      });
    }
    pinchFrom.current = twoFingerState(t);
    setPinch({ scale: 1, x: 0, y: 0 });
    setPinching(true);
  }

  function endPinch() {
    if (!pinchFrom.current) return;
    pinchFrom.current = null;
    setPinching(false);
    // Springs back rather than staying zoomed. The photo lives in a feed —
    // leaving it parked at 3× would mean every scroll past it starts in a
    // state nobody chose, and there is no obvious way back to normal.
    setPinch({ scale: 1, x: 0, y: 0 });
    // Held one beat past the spring so the lifted copy is not yanked away
    // mid-animation — dropping it on release makes the photo snap rather
    // than settle.
    settleTimer.current = setTimeout(() => {
      settleTimer.current = null;
      setPinchRect(null);
    }, 260);
  }

  useEffect(
    () => () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    []
  );

  function onGalleryTouchStart(e: React.TouchEvent) {
    galleryIsTouchEvent.current = true;
    gestureConsumed.current = false;
    clearHold();

    if (e.touches.length > 1) {
      beginPinch(e.touches);
      return;
    }

    galleryTouchStartX.current = e.touches[0].clientX;
    galleryTouchStartY.current = e.touches[0].clientY;
    galleryTouchStartAt.current = e.timeStamp;
    galleryMoved.current = false;
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null;
      gestureConsumed.current = true;
      haptics.select();
      setPeekSrc(images[imgIdx] ?? null);
    }, HOLD_MS);
  }

  function onGalleryTouchMove(e: React.TouchEvent) {
    if (e.touches.length > 1) {
      // A second finger can land after the first — start the pinch from
      // wherever they are now, not from the single-finger origin.
      if (!pinchFrom.current) beginPinch(e.touches);
      else {
        const now = twoFingerState(e.touches);
        const from = pinchFrom.current;
        setPinch({
          scale: clampZoom(now.dist / Math.max(1, from.dist)),
          // Pan follows the midpoint, which is what makes it steerable
          // rather than just growing from the centre.
          x: now.midX - from.midX,
          y: now.midY - from.midY,
        });
      }
      return;
    }

    if (gestureConsumed.current) return;
    const dx = Math.abs(e.touches[0].clientX - galleryTouchStartX.current);
    const dy = Math.abs(e.touches[0].clientY - galleryTouchStartY.current);
    // Either axis: sideways is a swipe between images, vertical is the feed
    // scrolling past. Neither should still be arming a hold.
    if (dx > HOLD_SLOP_PX || dy > HOLD_SLOP_PX) {
      clearHold();
      galleryMoved.current = true;
    }
  }

  function onGalleryTouchEnd(e: React.TouchEvent) {
    clearHold();
    // Lifting one finger of two ends the pinch; the remaining finger must not
    // then be read as a swipe from wherever it happens to be.
    if (pinchFrom.current) {
      endPinch();
      return;
    }
    if (gestureConsumed.current) {
      gestureConsumed.current = false;
      // Deliberately does NOT close the peek: it stays until tapped.
      return;
    }

    const dx = galleryTouchStartX.current - e.changedTouches[0].clientX;
    const dy = galleryTouchStartY.current - e.changedTouches[0].clientY;
    if (Math.abs(dx) >= 30 && Math.abs(dx) > Math.abs(dy)) {
      // Swipe detected — advance exactly ONE image regardless of velocity
      setImgIdx((i) =>
        dx > 0 ? Math.min(i + 1, images.length - 1) : Math.max(i - 1, 0)
      );
    } else if (
      // A tap is a touch that stayed put and lifted quickly. Anything that
      // moved was the feed scrolling — two quick flicks up used to count as a
      // double-tap and hype whatever photo was under your thumb.
      !galleryMoved.current &&
      Math.abs(dx) < HOLD_SLOP_PX &&
      Math.abs(dy) < HOLD_SLOP_PX &&
      e.timeStamp - galleryTouchStartAt.current < 250
    ) {
      handleImageTap(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    }
  }
  function onGalleryTouchCancel() {
    clearHold();
    endPinch();
    gestureConsumed.current = false;
    setPeekSrc(null);
  }
  function onGalleryClick() {
    // On touch devices onTouchEnd already handled the tap; skip click synthesis.
    if (galleryIsTouchEvent.current) return;
    handleImageTap(); // desktop mouse click
  }
  function onGalleryContextMenu(e: React.MouseEvent) {
    // A long press on an image raises the WebView's own save/copy callout,
    // which would land on top of the viewer we just opened.
    e.preventDefault();
  }
  const showToast = useToast();
  // The bookmark: a tap saves and drops down the folders, a hold fans them
  // out, and the very first save explains the hold (see useSaveMenus).
  const saveButton = useRef<HTMLButtonElement>(null);
  const saveMenus = useSaveMenus({
    button: saveButton,
    target: { post: post.id },
    userId: uid,
    saved,
    setSaved,
    persist: persistSave,
    onSignedOut: () => showToast("Sign in to save"),
    iconSize: 21,
  });
  // A ?comment= link opens the sheet itself — landing on the post with the
  // comments closed is the same dead end the notification already had.
  const [commentsOpen, setCommentsOpen] = useState(!!focusCommentId);
  // Spent once. Reopening comments by hand later should not drag you back to
  // whichever comment the notification was about.
  const [focusId, setFocusId] = useState(focusCommentId);
  const [commentCount, setCommentCount] = useState(post.comment_count);
  const [shareOpen, setShareOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [liveCaption, setLiveCaption] = useState(post.caption);
  const [liveBody, setLiveBody] = useState(post.body);
  const [isHyper, setIsHyper] = useState(initialIsHyper ?? false);
  const [isMutualHyper, setIsMutualHyper] = useState(
    initialIsMutualHyper ?? false
  );
  const postTrack = parseTrack(post.track);
  const postPoll = parsePoll(post.poll);

  const lastTapRef = useRef({ at: 0, x: 0, y: 0 });

  // â”€â”€ Self-sync: resolve user + fetch hype/save/comment state â”€â”€
  useEffect(() => {
    let active = true;
    async function sync() {
      let id = uid;
      if (!id) {
        const { data } = await supabase.auth.getUser();
        id = data.user?.id ?? "";
        if (active && id) setUid(id);
      }
      if (!id) return;

      // Always re-fetch the authoritative hype count + comment count
      const [hypeRow, savedRow, countRow] = await Promise.all([
        post.initialHyped === undefined
          ? supabase
              .from("hypes")
              .select("id")
              .eq("user_id", id)
              .eq("target_type", "post")
              .eq("target_id", post.id)
              .maybeSingle()
          : Promise.resolve({ data: post.initialHyped ? { id: "x" } : null }),
        post.initialSaved === undefined
          ? supabase
              .from("saved_posts")
              .select("id")
              .eq("user_id", id)
              .eq("post_id", post.id)
              .maybeSingle()
          : Promise.resolve({ data: post.initialSaved ? { id: "x" } : null }),
        supabase
          .from("posts")
          .select("hype_count, comment_count")
          .eq("id", post.id)
          .maybeSingle(),
      ]);

      if (!active) return;
      setHyped(!!hypeRow.data);
      setSaved(!!savedRow.data);
      if (countRow.data) {
        setHypeCount(countRow.data.hype_count ?? post.hype_count);
        setCommentCount(countRow.data.comment_count ?? post.comment_count);
      }
    }
    sync();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id]);

  // ── Hyper relationship: does the viewer have this author as a Hyper,
  // and is it mutual (they've added the viewer back too)? Re-run after the
  // ··· menu's "Add/Remove Hyper" action so the badge updates immediately.
  const syncHyperRef = useRef<() => void>(() => {});
  useEffect(() => {
    let active = true;
    async function syncHyper() {
      let id = uid;
      if (!id) {
        const { data } = await supabase.auth.getUser();
        id = data.user?.id ?? "";
      }
      if (!id || id === post.user_id) return;
      const { data } = await supabase
        .from("close_friends")
        .select("user_id, friend_id")
        .or(
          `and(user_id.eq.${id},friend_id.eq.${post.user_id}),and(user_id.eq.${post.user_id},friend_id.eq.${id})`
        );
      if (!active) return;
      const rows = data ?? [];
      const iAdded = rows.some(
        (r: any) => r.user_id === id && r.friend_id === post.user_id
      );
      const theyAdded = rows.some(
        (r: any) => r.user_id === post.user_id && r.friend_id === id
      );
      setIsHyper(iAdded);
      setIsMutualHyper(iAdded && theyAdded);
    }
    syncHyperRef.current = syncHyper;
    // Parent (FeedList) already resolved the status for feed cards — only
    // self-fetch for standalone cards. The ref still lets the ⋯ menu re-sync.
    if (initialIsHyper === undefined) syncHyper();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id, uid]);

  const profile = post.profiles;
  const name = profile?.display_name ?? profile?.username ?? "User";
  const username = profile?.username;
  const hue = profile?.avatar_hue ?? 280;
  const profileHref =
    post.user_id === uid ? "/profile" : username ? `/u/${username}` : "#";

  async function toggleHype() {
    if (hypePending) return;
    if (!uid) {
      showToast("Sign in to hype");
      return;
    }
    const prev = hyped,
      prevCount = hypeCount;
    setHypePending(true);
    setHyped(!prev);
    setHypeCount((c) => c + (prev ? -1 : 1));
    if (!prev) {
      haptics.success();
      setHypeBurst(true);
      setShowParticles(true);
      setTimeout(() => setHypeBurst(false), 380);
      setTimeout(() => setShowParticles(false), 640);
    } else {
      // Taking it back used to be silent, which made the destructive half of
      // the toggle the one with no feedback.
      haptics.tap();
      setHypeBreak(true);
      setTimeout(() => setHypeBreak(false), 520);
    }
    try {
      const { data, error } = await supabase.rpc("toggle_hype", {
        p_target_type: "post",
        p_target_id: post.id,
        p_owner_id: post.user_id,
      });
      if (error) throw error;
      const res = hypeResult(data);
      if (res) {
        setHyped(res.hyped);
        setHypeCount(res.hype_count);
      }
    } catch {
      setHyped(prev);
      setHypeCount(prevCount);
      showToast("Couldn't hype. Try again.", "error");
    } finally {
      setHypePending(false);
    }
  }

  // Double-tap to Hype -- only ever ADDS a hype, never removes one.
  function playBurst() {
    setHypeBurst(true);
    setShowParticles(true);
    setTimeout(() => setHypeBurst(false), 380);
    setTimeout(() => setShowParticles(false), 640);
  }

  function handleImageTap(x = 0, y = 0) {
    const now = Date.now();
    const last = lastTapRef.current;
    // Both taps close together in time AND on the same spot.
    if (now - last.at < 300 && Math.hypot(x - last.x, y - last.y) < 40) {
      if (!hyped && !hypePending) {
        toggleHype(); // hypes (burst handled inside)
      } else {
        playBurst(); // already hyped â†’ replay heart, do NOT unhype
      }
    }
    lastTapRef.current = { at: now, x, y };
  }

  /** Save or unsave for real; resolves whether it worked. No success toast:
   *  the bookmark filling in, and the menu over it, say so. */
  async function persistSave(next: boolean): Promise<boolean> {
    if (savePending || !uid) return false;
    const prev = saved;
    setSavePending(true);
    setSaved(next);
    haptics.select();
    if (next) {
      setSaveBurst(true);
      setTimeout(() => setSaveBurst(false), 360);
    }
    const { error } = next
      ? await supabase.from("saved_posts").insert({ user_id: uid, post_id: post.id })
      : await supabase.from("saved_posts").delete().eq("user_id", uid).eq("post_id", post.id);
    setSavePending(false);
    // Already saved is what a save wanted.
    if (error && !(next && /duplicate|unique/i.test(error.message))) {
      setSaved(prev);
      showToast(next ? "Couldn't save" : "Couldn't unsave", "error");
      return false;
    }
    return true;
  }

  /** The plain toggle, for the full-screen peek, which has no room for menus. */
  async function toggleSave() {
    if (!uid) return showToast("Sign in to save");
    const next = !saved;
    if (await persistSave(next)) showToast(next ? "Saved" : "Removed", next ? "success" : undefined);
  }

  if (deleted) return null;

  return (
    <article ref={cardRef} className="relative border-b border-border/50 pb-3">
      {/* Telemetry only — records that this card was actually on screen.
          Nothing reads it yet; it exists so there is history to rank with
          later. Skips the author's own posts. */}
      {post.user_id !== uid && (
        <FeedImpression postId={post.id} viewerId={uid} />
      )}
      {/* Repost attribution */}
      {post._repostedBy && (
        <div className="flex items-center gap-1.5 px-4 pt-2.5 text-xs text-muted">
          <Repeat2 size={14} className="text-accent" />
          <span className="font-semibold">{post._repostedBy}</span> reposted
        </div>
      )}
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Their face takes you to them: their Show while one is live,
            otherwise their profile. It used to open their avatar full-screen,
            which is a photo of a person where you expected the person. */}
        <Link
          href={showId ? `/shows/${showId}` : profileHref}
          aria-label={showId ? `Watch ${name}'s Show` : `${name}'s profile`}
          className="shrink-0 transition-transform active:scale-95"
        >
          <AvatarFrame id={profile ? visibleDecoration(profile) : null} size={40}>
            <Avatar
              name={name}
              hue={hue}
              size={40}
              src={profile?.avatar_url ?? undefined}
            />
          </AvatarFrame>
        </Link>
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <Link
            href={profileHref}
            className="flex min-w-0 text-sm font-semibold hover:underline"
          >
            <DisplayName name={name} profile={profile} className="min-w-0 truncate" />
          </Link>
          {profile?.is_verified && (
            <VerifiedStar className="h-3.5 w-3.5 shrink-0 text-verified" />
          )}
          {isHyper && <HyperStar className="h-3.5 w-3.5 shrink-0" />}
          {isMutualHyper && <MutualHyperBadge />}
          <span className="ml-1 text-xs text-faint">
            · {timeAgoShort(post.created_at)}
          </span>
        </div>
        {/* THREE DOTS -- fully functional */}
        <button
          type="button"
          aria-label="More"
          onClick={() => setActionsOpen(true)}
          className="-mr-1 flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-white/5"
        >
          <MoreHorizontal size={20} />
        </button>
      </div>

      {/* Image gallery -- swipe/scroll between images; double-tap to Hype */}
      {images.length > 0 && (
        <div
          ref={galleryRef}
          className="group relative mx-4 overflow-hidden rounded-2xl"
          // Tells SwipeNav this element owns its sideways drags. It is
          // overflow-hidden with a JS transform, so nothing about its computed
          // style identifies it as a carousel — without this, swiping between
          // a post's photos was read as a tab swipe and landed you in Messages.
          data-hswipe=""
          onTouchStart={onGalleryTouchStart}
          onTouchMove={onGalleryTouchMove}
          onTouchEnd={onGalleryTouchEnd}
          onTouchCancel={onGalleryTouchCancel}
          onContextMenu={onGalleryContextMenu}
          onClick={onGalleryClick}
          // pan-y keeps the feed scrolling under the photo while taking the
          // browser's own pinch-to-zoom off the table, so two fingers here
          // mean our gesture rather than zooming the whole page.
          style={{
            touchAction: "pan-y",
            WebkitTouchCallout: "none",
            WebkitUserSelect: "none",
            userSelect: "none",
          }}
        >
          {/* Transform-based slide — no native scroll so velocity cannot skip frames */}
          <div
            className="flex transition-transform duration-300 ease-out will-change-transform"
            style={{ transform: `translateX(-${imgIdx * 100}%)` }}
          >
            {images.map((src, i) => (
              // Frame the post in the shape it was composed at, within the
              // shapes the feed draws (see feedRatio). This was hardcoded to
              // aspect-square, so a 3:4 or 16:9 post got cropped a second time
              // back to a square and the composer's picker did nothing; then it
              // honoured the stored ratio exactly, and a 0.4 screenshot took
              // two and a half screens on its own.
              <div
                key={i}
                className="relative w-full shrink-0 select-none"
                style={{ aspectRatio: String(feedRatio(post.aspect_ratio)) }}
              >
                <OptimizedImage
                  src={src}
                  alt={post.caption ?? "Post"}
                  sizes="(max-width: 480px) 100vw, 448px"
                  className="object-cover"
                  draggable={false}
                />
              </div>
            ))}
          </div>

          {/* Double-tap burst (centred over the gallery) */}
          {hypeBurst && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <Star
                size={88}
                className="animate-hype-pop text-hype drop-shadow-[0_4px_20px_rgba(255,208,0,0.5)]"
                fill="currentColor"
              />
            </div>
          )}
          {showParticles && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <HypeParticles size={16} />
            </div>
          )}

          {/* The left/right arrows used to sit here, and the "2/5" counter in
              the top-right corner with them. Both were chrome parked on top of
              the photograph — two dark pills over the middle of the image and
              one over its corner, on every gallery post, permanently. Swiping
              is how anyone actually moves through these, and the dots below
              already say where you are and how many there are; tapping a dot
              still jumps straight to that image, so nothing was lost with a
              pointer either. */}

          {/* The expand button used to sit here. Hold or pinch the photo
              instead — see onGalleryTouchStart. Kept for pointer devices,
              which have neither gesture, but only while hovering, so it no
              longer covers the corner of every photo on a phone. */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setZoomOpen(true);
            }}
            aria-label="View full image"
            className="absolute bottom-2.5 right-2.5 z-10 hidden h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 hover:bg-black/70 focus-visible:opacity-100 [@media(hover:hover)]:flex"
          >
            <Maximize2 size={15} />
          </button>

          {/* Multi-image position dots */}
          {images.length > 1 && (
            <div className="absolute inset-x-0 bottom-2.5 flex justify-center gap-1.5">
              {images.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setImgIdx(i);
                  }}
                  className={`h-1.5 rounded-full transition-all ${
                    i === imgIdx ? "w-4 bg-white" : "w-1.5 bg-white/50"
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between px-4 pt-3">
        <div className="flex items-center gap-5">
          <button
            type="button"
            onClick={toggleHype}
            disabled={hypePending}
            aria-pressed={hyped}
            aria-label="Hype"
            className="flex items-center gap-1.5 text-sm font-semibold tabular-nums transition-transform duration-150 active:scale-90 disabled:opacity-70"
          >
            <span className="relative">
              <Star
                size={23}
                strokeWidth={2.2}
                className={`${
                  hypeBurst
                    ? "animate-hype-burst"
                    : hypeBreak
                    ? "animate-hype-crack"
                    : ""
                } transition-colors ${hyped ? "text-hype" : "text-foreground"}`}
                fill={hyped ? "currentColor" : "none"}
              />
              {showParticles && <HypeParticles size={9} />}
              {hypeBreak && <HypeBreak size={23} />}
            </span>
            <span className={hyped ? "text-hype" : "text-foreground"}>
              {formatCount(hypeCount)}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setCommentsOpen(true)}
            aria-label="Comments"
            className="flex items-center gap-1.5 text-sm font-semibold text-foreground transition-transform duration-150 active:scale-90"
          >
            <MessageCircle size={22} strokeWidth={2.2} />
            {formatCount(commentCount)}
          </button>

          {/* Tap opens the share sheet; hold sends straight to the people
              you share with most. */}
          <ShareButton
            postId={post.id}
            onOpenSheet={() => setShareOpen(true)}
            className="flex items-center gap-1.5 text-sm font-semibold tabular-nums text-foreground transition-transform duration-150 active:scale-90"
          >
            <Plane size={21} weight="bold" />
            {((post as any).share_count ?? 0) > 0 &&
              formatCount((post as any).share_count)}
          </ShareButton>
        </div>

        <button
          type="button"
          ref={saveButton}
          {...saveMenus.handlers}
          aria-label={saved ? "Saved. Tap for folders, hold to file" : "Save"}
          aria-haspopup="menu"
          className="text-foreground transition-transform duration-150 active:scale-90"
          // A press that starts here is a tap or a hold-and-slide, never a scroll.
          style={{ touchAction: "none", WebkitTouchCallout: "none" }}
        >
          <Bookmark
            size={21}
            strokeWidth={2.2}
            className={`${
              saveBurst ? "animate-hype-burst" : ""
            } transition-colors ${saved ? "text-accent" : ""}`}
            fill={saved ? "currentColor" : "none"}
          />
        </button>
      </div>

      {/* Caption -- clamps long text with a more / less toggle */}
      {(liveCaption || liveBody) && (
        <ExpandableText
          className="px-4 pt-2 text-sm leading-snug"
          clampClass="line-clamp-2"
        >
          {liveCaption && (
            <p>
              <Link
                href={profileHref}
                className="font-semibold hover:underline"
              >
                {username ? `@${username}` : name}
              </Link>{" "}
              <RichPostText text={liveCaption} />
            </p>
          )}
          {liveBody && (
            <p className="mt-1 text-foreground/85">
              <RichPostText text={liveBody} />
            </p>
          )}
        </ExpandableText>
      )}

      {/* Poll */}
      {postPoll && (
        <PollBlock
          postId={post.id}
          poll={postPoll}
          currentUserId={uid}
          isOwn={uid === post.user_id}
        />
      )}

      {/* Attached song — starts on scroll-into-view, stops on scroll-away.
          The speaker toggle mutes music globally (persisted). */}
      {postTrack && (
        <div className="flex items-center gap-1.5 px-4 pt-2">
          {/* Watches the card, not itself: the song is the post's, so it
              starts when the post is what you are looking at. */}
          <TrackChip track={postTrack} autoPlayInView watch={cardRef} />
          <MusicMuteButton />
        </div>
      )}

      {/* Sheets */}
      <CommentsSheet
        open={commentsOpen}
        onClose={() => {
          setCommentsOpen(false);
          setFocusId(null);
        }}
        postId={post.id}
        postOwnerId={post.user_id}
        currentUserId={uid}
        onCountChange={(n) => setCommentCount(n)}
        focusCommentId={focusId}
      />

      {saveMenus.overlays}

      <ShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        postId={post.id}
        imageUrls={images.length > 0 ? images : undefined}
        initialImageIdx={imgIdx}
      />

      {/* Opened by a hold and it stays. Given the card's own author, caption
          and actions so it is a post you can act on, not just a bigger photo
          you have to dismiss before you can do anything about it. */}
      {peekSrc && (
        <PostPeek
          src={peekSrc}
          aspectRatio={post.aspect_ratio}
          postId={post.id}
          author={{
            id: post.user_id,
            name,
            username: username ?? null,
            avatarUrl: profile?.avatar_url ?? null,
            hue,
            verified: !!profile?.is_verified,
            cosmetics: profile,
          }}
          caption={post.caption ?? null}
          currentUserId={uid}
          hyped={hyped}
          hypeCount={hypeCount}
          commentCount={commentCount}
          saved={saved}
          onHype={toggleHype}
          onComment={() => setCommentsOpen(true)}
          onShare={() => setShareOpen(true)}
          onSave={toggleSave}
          onClose={() => setPeekSrc(null)}
        />
      )}

      {/* Pinched. Lifted out of the card because it cannot grow past it in
          place: the feed virtualises with content-visibility, which paints
          with containment, so a card clips its own contents whatever the
          gallery asks for. */}
      {pinchRect && images[imgIdx] && (
        <PinchLayer
          src={images[imgIdx]}
          rect={pinchRect}
          scale={pinch.scale}
          x={pinch.x}
          y={pinch.y}
          settling={!pinching}
        />
      )}

      {zoomOpen && images[imgIdx] && (
        <ZoomViewer src={images[imgIdx]} onClose={() => setZoomOpen(false)} />
      )}

      <PostActionsSheet
        open={actionsOpen}
        onClose={() => setActionsOpen(false)}
        postId={post.id}
        postUserId={post.user_id}
        postUsername={username ?? null}
        currentUserId={uid}
        onHyperChange={() => syncHyperRef.current()}
        onDelete={() => setDeleted(true)}
        onRestore={() => setDeleted(false)}
        preview={{ image: images[0] ?? null, caption: liveCaption ?? liveBody ?? null }}
        onEdit={() => setEditOpen(true)}
      />

      <EditPostSheet
        open={editOpen}
        onClose={() => setEditOpen(false)}
        postId={post.id}
        initialCaption={liveCaption}
        initialBody={liveBody}
        onSaved={(c, b) => {
          setLiveCaption(c || null);
          setLiveBody(b || null);
        }}
      />
    </article>
  );
}
