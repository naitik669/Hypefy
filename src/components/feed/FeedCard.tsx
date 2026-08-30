"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Star, MessageCircle, Send, Bookmark, MoreHorizontal, Maximize2, Repeat2, ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";
import { ZoomViewer } from "@/components/ui/ZoomViewer";
import { ExpandableText } from "@/components/ui/ExpandableText";
import { RichPostText } from "@/components/ui/RichPostText";
import { CommentsSheet } from "@/components/feed/CommentsSheet";
import { PostActionsSheet } from "@/components/feed/PostActionsSheet";
import { ShareSheet } from "@/components/feed/ShareSheet";
import { EditPostSheet } from "@/components/feed/EditPostSheet";
import { HypeParticles } from "@/components/feed/HypeParticles";
import { VerifiedStar } from "@/components/ui/VerifiedStar";
import { HyperStar } from "@/components/ui/HyperStar";
import { MutualHyperBadge } from "@/components/ui/MutualHyperBadge";
import { formatCount } from "@/lib/format";
import { haptics } from "@/lib/haptics";
import { OptimizedImage } from "@/components/ui/OptimizedImage";
import { useToast } from "@/components/ui/ToastProvider";
import { TrackChip } from "@/components/music/TrackChip";
import { MusicMuteButton } from "@/components/music/MusicMuteButton";
import { parseTrack } from "@/lib/music";
import { hypeResult } from "@/lib/supabase/typed";
import { PollBlock, parsePoll } from "@/components/feed/PollBlock";

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

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/** Deduplicate and merge single/multi image fields */
function getImages(post: FeedPost): string[] {
  const urls = post.image_urls?.length ? post.image_urls : post.image_url ? [post.image_url] : [];
  return [...new Set(urls)];
}

export function FeedCard({
  post,
  currentUserId,
  initialIsHyper,
  initialIsMutualHyper,
}: {
  post: FeedPost;
  currentUserId: string;
  /** Hyper status resolved by the parent (FeedList) — skips a per-card query.
   *  Undefined for standalone cards (post page, profile viewer), which self-fetch. */
  initialIsHyper?: boolean;
  initialIsMutualHyper?: boolean;
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
  const [saveBurst, setSaveBurst] = useState(false);

  const [saved, setSaved] = useState(post.initialSaved ?? false);
  const [savePending, setSavePending] = useState(false);

  const [imgIdx, setImgIdx] = useState(0);
  // JS-controlled swipe: one image per gesture, no native scroll momentum
  const galleryTouchStartX = useRef(0);
  const galleryIsTouchEvent = useRef(false);

  function onGalleryTouchStart(e: React.TouchEvent) {
    galleryTouchStartX.current = e.touches[0].clientX;
    galleryIsTouchEvent.current = true;
  }
  function onGalleryTouchEnd(e: React.TouchEvent) {
    const dx = galleryTouchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(dx) >= 30) {
      // Swipe detected — advance exactly ONE image regardless of velocity
      setImgIdx((i) =>
        dx > 0 ? Math.min(i + 1, images.length - 1) : Math.max(i - 1, 0),
      );
    } else {
      handleImageTap(); // small move = tap
    }
  }
  function onGalleryClick() {
    // On touch devices onTouchEnd already handled the tap; skip click synthesis.
    if (galleryIsTouchEvent.current) return;
    handleImageTap(); // desktop mouse click
  }
  const showToast = useToast();
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(post.comment_count);
  const [shareOpen, setShareOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [avatarZoomOpen, setAvatarZoomOpen] = useState(false);
  const [liveCaption, setLiveCaption] = useState(post.caption);
  const [liveBody, setLiveBody] = useState(post.body);
  const [isHyper, setIsHyper] = useState(initialIsHyper ?? false);
  const [isMutualHyper, setIsMutualHyper] = useState(initialIsMutualHyper ?? false);
  const postTrack = parseTrack(post.track);
  const postPoll = parsePoll(post.poll);

  const lastTapRef = useRef(0);

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
          ? supabase.from("hypes").select("id").eq("user_id", id).eq("target_type", "post").eq("target_id", post.id).maybeSingle()
          : Promise.resolve({ data: post.initialHyped ? { id: "x" } : null }),
        post.initialSaved === undefined
          ? supabase.from("saved_posts").select("id").eq("user_id", id).eq("post_id", post.id).maybeSingle()
          : Promise.resolve({ data: post.initialSaved ? { id: "x" } : null }),
        supabase.from("posts").select("hype_count, comment_count").eq("id", post.id).maybeSingle(),
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
    return () => { active = false; };
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
        .or(`and(user_id.eq.${id},friend_id.eq.${post.user_id}),and(user_id.eq.${post.user_id},friend_id.eq.${id})`);
      if (!active) return;
      const rows = data ?? [];
      const iAdded = rows.some((r: any) => r.user_id === id && r.friend_id === post.user_id);
      const theyAdded = rows.some((r: any) => r.user_id === post.user_id && r.friend_id === id);
      setIsHyper(iAdded);
      setIsMutualHyper(iAdded && theyAdded);
    }
    syncHyperRef.current = syncHyper;
    // Parent (FeedList) already resolved the status for feed cards — only
    // self-fetch for standalone cards. The ref still lets the ⋯ menu re-sync.
    if (initialIsHyper === undefined) syncHyper();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id, uid]);

  const profile = post.profiles;
  const name = profile?.display_name ?? profile?.username ?? "User";
  const username = profile?.username;
  const hue = profile?.avatar_hue ?? 280;
  const profileHref = post.user_id === uid ? "/profile" : username ? `/u/${username}` : "#";


  async function toggleHype() {
    if (hypePending) return;
    if (!uid) { showToast("Sign in to hype"); return; }
    const prev = hyped, prevCount = hypeCount;
    setHypePending(true);
    setHyped(!prev);
    setHypeCount((c) => c + (prev ? -1 : 1));
    if (!prev) {
      haptics.success();
      setHypeBurst(true); setShowParticles(true);
      setTimeout(() => setHypeBurst(false), 380);
      setTimeout(() => setShowParticles(false), 640);
    }
    try {
      const { data, error } = await supabase.rpc("toggle_hype", {
        p_target_type: "post", p_target_id: post.id, p_owner_id: post.user_id,
      });
      if (error) throw error;
      const res = hypeResult(data);
      if (res) {
        setHyped(res.hyped);
        setHypeCount(res.hype_count);
      }
    } catch {
      setHyped(prev); setHypeCount(prevCount);
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

  function handleImageTap() {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      if (!hyped && !hypePending) {
        toggleHype(); // hypes (burst handled inside)
      } else {
        playBurst(); // already hyped â†’ replay heart, do NOT unhype
      }
    }
    lastTapRef.current = now;
  }

  async function toggleSave() {
    if (savePending) return;
    if (!uid) { showToast("Sign in to save"); return; }
    const prev = saved;
    setSavePending(true); setSaved(!prev);
    haptics.select();
    if (!prev) {
      setSaveBurst(true);
      setTimeout(() => setSaveBurst(false), 360);
      const { error } = await supabase.from("saved_posts").insert({ user_id: uid, post_id: post.id });
      if (error) { setSaved(prev); if (!/duplicate|unique/i.test(error.message)) showToast("Couldn't save", "error"); }
      else showToast("Saved", "success");
    } else {
      const { error } = await supabase.from("saved_posts").delete().eq("user_id", uid).eq("post_id", post.id);
      if (error) { setSaved(prev); showToast("Couldn't unsave", "error"); }
      else showToast("Removed");
    }
    setSavePending(false);
  }

  if (deleted) return null;

  return (
    <article className="relative border-b border-border/50 pb-3">
      {/* Repost attribution */}
      {post._repostedBy && (
        <div className="flex items-center gap-1.5 px-4 pt-2.5 text-xs text-muted">
          <Repeat2 size={14} className="text-accent" />
          <span className="font-semibold">{post._repostedBy}</span> reposted
        </div>
      )}
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          aria-label={`View ${name}'s photo`}
          onClick={() => { if (profile?.avatar_url) setAvatarZoomOpen(true); else window.location.href = profileHref; }}
          className="shrink-0 active:scale-95 transition-transform"
        >
          <Avatar name={name} hue={hue} size={40} src={profile?.avatar_url ?? undefined} />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <Link href={profileHref} className="truncate text-sm font-semibold hover:underline">{name}</Link>
          {profile?.is_verified && <VerifiedStar className="h-3.5 w-3.5 shrink-0 text-verified" />}
          {isHyper && <HyperStar className="h-3.5 w-3.5 shrink-0" />}
          {isMutualHyper && <MutualHyperBadge />}
          <span className="ml-1 text-xs text-faint">· {timeAgo(post.created_at)}</span>
        </div>
        {/* THREE DOTS -- fully functional */}
        <button type="button" aria-label="More" onClick={() => setActionsOpen(true)}
          className="-mr-1 flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-white/5">
          <MoreHorizontal size={20} />
        </button>
      </div>

      {/* Image gallery -- swipe/scroll between images; double-tap to Hype */}
      {images.length > 0 && (
        <div
          className="relative mx-4 overflow-hidden rounded-2xl"
          onTouchStart={onGalleryTouchStart}
          onTouchEnd={onGalleryTouchEnd}
          onClick={onGalleryClick}
        >
          {/* Transform-based slide — no native scroll so velocity cannot skip frames */}
          <div
            className="flex transition-transform duration-300 ease-out will-change-transform"
            style={{ transform: `translateX(-${imgIdx * 100}%)` }}
          >
            {images.map((src, i) => (
              // Frame the post in the shape it was composed at. This was
              // hardcoded to aspect-square, so a 3:4 or 16:9 post — already
              // cropped to that shape on upload — got cropped a second time
              // back to a square here, and the picker in the composer had no
              // visible effect at all.
              <div
                key={i}
                className="relative w-full shrink-0 select-none"
                style={{ aspectRatio: String(post.aspect_ratio ?? 1) }}
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
              <Star size={88} className="animate-hype-pop text-hype drop-shadow-[0_4px_20px_rgba(255,208,0,0.5)]" fill="currentColor" />
            </div>
          )}
          {showParticles && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <HypeParticles size={16} />
            </div>
          )}

          {/* Left/right arrows -- desktop-friendly nav, mirrors the swipe gesture */}
          {images.length > 1 && (
            <>
              {imgIdx > 0 && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setImgIdx((i) => Math.max(i - 1, 0)); }}
                  aria-label="Previous image"
                  className="absolute left-2.5 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
                >
                  <ChevronLeft size={18} />
                </button>
              )}
              {imgIdx < images.length - 1 && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setImgIdx((i) => Math.min(i + 1, images.length - 1)); }}
                  aria-label="Next image"
                  className="absolute right-2.5 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
                >
                  <ChevronRight size={18} />
                </button>
              )}
            </>
          )}

          {/* Expand â†’ full-screen pinch-to-zoom viewer */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setZoomOpen(true); }}
            aria-label="View full image"
            className="absolute bottom-2.5 right-2.5 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
          >
            <Maximize2 size={15} />
          </button>

          {/* Multi-image dots + counter */}
          {images.length > 1 && (
            <>
              <span className="absolute right-2.5 top-2.5 rounded-full bg-black/50 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
                {imgIdx + 1}/{images.length}
              </span>
              <div className="absolute inset-x-0 bottom-2.5 flex justify-center gap-1.5">
                {images.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setImgIdx(i); }}
                    className={`h-1.5 rounded-full transition-all ${i === imgIdx ? "w-4 bg-white" : "w-1.5 bg-white/50"}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between px-4 pt-3">
        <div className="flex items-center gap-5">
          <button type="button" onClick={toggleHype} disabled={hypePending}
            aria-pressed={hyped} aria-label="Hype"
            className="flex items-center gap-1.5 text-sm font-semibold tabular-nums transition-transform duration-150 active:scale-90 disabled:opacity-70">
            <span className="relative">
              <Star size={23} strokeWidth={2.2}
                className={`${hypeBurst ? "animate-hype-burst" : ""} transition-colors ${hyped ? "text-hype" : "text-foreground"}`}
                fill={hyped ? "currentColor" : "none"} />
              {showParticles && <HypeParticles size={9} />}
            </span>
            <span className={hyped ? "text-hype" : "text-foreground"}>{formatCount(hypeCount)}</span>
          </button>

          <button type="button" onClick={() => setCommentsOpen(true)} aria-label="Comments"
            className="flex items-center gap-1.5 text-sm font-semibold text-foreground transition-transform duration-150 active:scale-90">
            <MessageCircle size={22} strokeWidth={2.2} />
            {formatCount(commentCount)}
          </button>

          <button type="button" onClick={() => setShareOpen(true)} aria-label="Share"
            className="flex items-center gap-1.5 text-sm font-semibold tabular-nums text-foreground transition-transform duration-150 active:scale-90">
            <Send size={21} strokeWidth={2.2} />
            {((post as any).share_count ?? 0) > 0 && formatCount((post as any).share_count)}
          </button>
        </div>

        <button type="button" onClick={toggleSave} disabled={savePending} aria-label="Save"
          className="text-foreground transition-transform duration-150 active:scale-90 disabled:opacity-70">
          <Bookmark size={21} strokeWidth={2.2}
            className={`${saveBurst ? "animate-hype-burst" : ""} transition-colors ${saved ? "text-accent" : ""}`}
            fill={saved ? "currentColor" : "none"} />
        </button>
      </div>

      {/* Caption -- clamps long text with a more / less toggle */}
      {(liveCaption || liveBody) && (
        <ExpandableText className="px-4 pt-2 text-sm leading-snug" clampClass="line-clamp-2">
          {liveCaption && (
            <p>
              <Link href={profileHref} className="font-semibold hover:underline">
                {username ? `@${username}` : name}
              </Link>{" "}
              <RichPostText text={liveCaption} />
            </p>
          )}
          {liveBody && <p className="mt-1 text-foreground/85"><RichPostText text={liveBody} /></p>}
        </ExpandableText>
      )}

      {/* Poll */}
      {postPoll && (
        <PollBlock postId={post.id} poll={postPoll} currentUserId={uid} isOwn={uid === post.user_id} />
      )}

      {/* Attached song — starts on scroll-into-view, stops on scroll-away.
          The speaker toggle mutes music globally (persisted). */}
      {postTrack && (
        <div className="flex items-center gap-1.5 px-4 pt-2">
          <TrackChip track={postTrack} autoPlayInView />
          <MusicMuteButton />
        </div>
      )}

      {/* Sheets */}
      <CommentsSheet open={commentsOpen} onClose={() => setCommentsOpen(false)}
        postId={post.id} postOwnerId={post.user_id} currentUserId={uid}
        onCountChange={(n) => setCommentCount(n)} />

      <ShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        postId={post.id}
        imageUrls={images.length > 0 ? images : undefined}
        initialImageIdx={imgIdx}
      />

      {zoomOpen && images[imgIdx] && (
        <ZoomViewer src={images[imgIdx]} onClose={() => setZoomOpen(false)} />
      )}

      {avatarZoomOpen && profile?.avatar_url && (
        <ZoomViewer src={profile.avatar_url} onClose={() => setAvatarZoomOpen(false)} />
      )}

      <PostActionsSheet open={actionsOpen} onClose={() => setActionsOpen(false)}
        postId={post.id} postUserId={post.user_id} postUsername={username ?? null}
        currentUserId={uid}
        onHyperChange={() => syncHyperRef.current()}
        onDelete={() => setDeleted(true)}
        onEdit={() => setEditOpen(true)} />

      <EditPostSheet open={editOpen} onClose={() => setEditOpen(false)}
        postId={post.id} initialCaption={liveCaption} initialBody={liveBody}
        onSaved={(c, b) => { setLiveCaption(c || null); setLiveBody(b || null); }} />
    </article>
  );
}
