"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Star, MessageCircle, Send, Bookmark, Volume2, VolumeX, Play, ChevronLeft, MoreHorizontal, Trash2, BookmarkCheck, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";
import { CommentsSheet } from "@/components/feed/CommentsSheet";
import { ShareSheet } from "@/components/feed/ShareSheet";
import { HypeParticles } from "@/components/feed/HypeParticles";
import { formatCount } from "@/lib/format";
import { ExpandableText } from "@/components/ui/ExpandableText";
import { haptics } from "@/lib/haptics";
import { useToast } from "@/components/ui/ToastProvider";
import { hypeResult } from "@/lib/supabase/typed";

type ReelProfile = { display_name: string | null; avatar_hue: number | null; username: string | null } | null;

export type Reel = {
  id: string;
  user_id: string;
  media_url: string;
  caption: string | null;
  created_at: string;
  hype_count?: number;
  comment_count?: number;
  profiles: ReelProfile;
};

/**
 * Shots = Reels. Full-screen vertical autoplay feed.
 * Uses JS-controlled swipe so each gesture advances exactly ONE reel —
 * native scroll momentum cannot skip multiple shots.
 */
export function ReelsFeed({
  reels: initialReels,
  currentUserId,
}: {
  reels: Reel[];
  currentUserId: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [reels, setReels] = useState<Reel[]>(initialReels);
  // Audible by default; ReelCard falls back to muted if the browser blocks
  // unmuted autoplay (no user gesture yet, e.g. a direct page load).
  const [muted, setMuted] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const swipeTouchStartY = useRef(0);
  /** Live finger offset in px, null when no finger is down. Doubles as the
   *  "is dragging" flag, which is what decides whether the transform
   *  animates: following a finger must be instant, settling must not. */
  const [drag, setDrag] = useState<number | null>(null);
  const swipeStartedAt = useRef(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const fetchingMore = useRef(false);
  const [noMore, setNoMore] = useState(initialReels.length < 5);

  // Fetch the next batch when the viewer nears the end of the loaded reels
  useEffect(() => {
    if (noMore || fetchingMore.current) return;
    if (activeIdx < reels.length - 2) return;
    fetchingMore.current = true;
    const oldest = reels[reels.length - 1]?.created_at;
    if (!oldest) { fetchingMore.current = false; return; }
    supabase
      .from("shots")
      .select("id, user_id, media_url, caption, created_at, hype_count, comment_count, profiles(display_name, avatar_hue, username)")
      .lt("created_at", oldest)
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data }) => {
        const fresh = (data ?? []).map((s: any) => ({
          ...s,
          profiles: Array.isArray(s.profiles) ? s.profiles[0] ?? null : s.profiles,
        })) as Reel[];
        if (fresh.length < 10) setNoMore(true);
        if (fresh.length > 0) {
          setReels((prev) => [...prev, ...fresh.filter((f) => !prev.some((p) => p.id === f.id))]);
        }
        fetchingMore.current = false;
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx, reels.length, noMore]);

  function onSwipeTouchStart(e: React.TouchEvent) {
    swipeTouchStartY.current = e.touches[0].clientY;
    swipeStartedAt.current = Date.now();
    setDrag(0);
  }

  /**
   * Follow the finger.
   *
   * Without this the screen sat frozen through the whole gesture and only
   * jumped on release, which is what made swiping feel unresponsive — you got
   * no indication a swipe was even being registered.
   */
  function onSwipeTouchMove(e: React.TouchEvent) {
    if (drag === null) return;
    let dy = e.touches[0].clientY - swipeTouchStartY.current;

    // Resist at the ends so pulling past the last reel feels like a boundary
    // rather than a broken screen. Downward at index 0 stays free, because
    // that gesture exits Shots and should not fight the user.
    const atEnd = activeIdx === reels.length - 1 && dy < 0;
    if (atEnd) dy *= 0.3;

    setDrag(dy);
  }

  function onSwipeTouchEnd() {
    const dy = drag ?? 0;
    setDrag(null);

    const height = stageRef.current?.clientHeight ?? 1;
    const elapsed = Math.max(1, Date.now() - swipeStartedAt.current);
    const velocity = Math.abs(dy) / elapsed; // px per ms

    // Distance OR speed. Distance alone ignored quick flicks, which are the
    // most common way people move through a reels feed; a fast 30px flick
    // read as a tap and did nothing.
    const committed = Math.abs(dy) > height * 0.18 || velocity > 0.45;
    if (!committed) return; // springs back via the transition

    if (dy < 0) {
      setActiveIdx((i) => Math.min(i + 1, reels.length - 1));
    } else if (activeIdx === 0) {
      // Pulling down on the first reel leaves Shots.
      router.back();
    } else {
      setActiveIdx((i) => i - 1);
    }
  }

  return (
    <div
      ref={stageRef}
      className="fixed inset-x-0 top-0 bottom-[72px] z-10 mx-auto max-w-[480px] touch-none overflow-hidden bg-black"
      onTouchStart={onSwipeTouchStart}
      onTouchMove={onSwipeTouchMove}
      onTouchEnd={onSwipeTouchEnd}
      onTouchCancel={() => setDrag(null)}
    >
      {/* Absolute-positioned reels: each fills the container, translated by index offset */}
      {reels.map((reel, i) => (
        <div
          key={reel.id}
          className={`absolute inset-0 will-change-transform ${i === activeIdx ? "" : "pointer-events-none"}`}
          style={{
            transform: `translateY(calc(${i - activeIdx} * 100% + ${drag ?? 0}px))`,
            // No transition while a finger is down — the reel has to track it
            // exactly. On release the settle is shorter than the old 0.4s,
            // which read as sluggish once the drag itself became live.
            transition: drag === null
              ? "transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)"
              : "none",
          }}
        >
          <ReelCard
            reel={reel}
            currentUserId={currentUserId}
            muted={muted}
            onToggleMute={() => setMuted((m) => !m)}
            onAutoplayBlocked={() => setMuted(true)}
            isActive={i === activeIdx}
            onBack={() => router.back()}
            // Buffer the current reel + its immediate neighbours so swiping to
            // the next one is instant; keep the rest at metadata only.
            preload={Math.abs(i - activeIdx) <= 1 ? "auto" : "metadata"}
          />
        </div>
      ))}
    </div>
  );
}

function ReelCard({
  reel,
  currentUserId,
  muted,
  onToggleMute,
  onAutoplayBlocked,
  isActive,
  onBack,
  preload = "metadata",
}: {
  reel: Reel;
  currentUserId: string | null;
  muted: boolean;
  onToggleMute: () => void;
  onAutoplayBlocked: () => void;
  isActive: boolean;
  onBack: () => void;
  preload?: "auto" | "metadata" | "none";
}) {
  const supabase = createClient();
  const showToast = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0); // 0..1 playback position
  const [buffering, setBuffering] = useState(false);

  const name = reel.profiles?.display_name ?? reel.profiles?.username ?? "User";
  const handle = reel.profiles?.username;
  const hue = reel.profiles?.avatar_hue ?? 280;

  const [hyped, setHyped] = useState(false);
  const [hypeCount, setHypeCount] = useState(reel.hype_count ?? 0);
  const [hypePending, setHypePending] = useState(false);

  const [commentCount, setCommentCount] = useState(reel.comment_count ?? 0);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const [saved, setSaved] = useState(false);
  const [savePending, setSavePending] = useState(false);

  // Owner controls
  const isOwner = !!currentUserId && currentUserId === reel.user_id;
  const [ownerMenuOpen, setOwnerMenuOpen] = useState(false);
  const [inShowcase, setInShowcase] = useState(false);
  const [ownerAction, setOwnerAction] = useState<"delete" | "showcase" | null>(null);
  const [deleted, setDeleted] = useState(false);

  // Double-tap-to-Hype (animations mirror the feed: 380ms burst + 640ms particles)
  const [hypeBurst, setHypeBurst] = useState(false);
  const [showParticles, setShowParticles] = useState(false);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTap = useRef(0);

  // Autoplay the active reel; pause all others.
  // isActive is driven by the parent's JS-controlled index — no IntersectionObserver needed.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (isActive) {
      el.play().then(() => setPlaying(true)).catch(() => {
        // Unmuted autoplay is blocked before the first user gesture (direct
        // page load) — fall back to muted so the reel still starts, and sync
        // the global toggle so the speaker icon tells the truth.
        if (!el.muted) {
          onAutoplayBlocked();
          el.muted = true;
          el.play().then(() => setPlaying(true)).catch(() => {});
        }
      });
    } else {
      el.pause();
      el.currentTime = 0; // rewind so it restarts clean when revisited
      setPlaying(false);
      setProgress(0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  // Load hype + saved state for the current user.
  useEffect(() => {
    let active = true;
    async function load() {
      if (!currentUserId) return;
      const [mine, total, savedRow] = await Promise.all([
        supabase
          .from("hypes")
          .select("id")
          .eq("user_id", currentUserId)
          .eq("target_type", "shot")
          .eq("target_id", reel.id)
          .maybeSingle(),
        supabase.from("shots").select("hype_count, comment_count, in_showcase").eq("id", reel.id).maybeSingle(),
        supabase
          .from("saved_shots")
          .select("id")
          .eq("user_id", currentUserId)
          .eq("shot_id", reel.id)
          .maybeSingle(),
      ]);
      if (!active) return;
      setHyped(!!mine.data);
      if (total.data) {
        setHypeCount(total.data.hype_count ?? 0);
        setCommentCount(total.data.comment_count ?? 0);
        setInShowcase(!!(total.data as any).in_showcase);
      }
      setSaved(!!savedRow.data);
    }
    load();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reel.id, currentUserId]);

  async function toggleHype() {
    if (hypePending || !currentUserId) return;
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
    }
    try {
      const { data, error } = await supabase.rpc("toggle_hype", {
        p_target_type: "shot",
        p_target_id: reel.id,
        p_owner_id: reel.user_id,
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
    } finally {
      setHypePending(false);
    }
  }

  async function toggleSave() {
    if (savePending || !currentUserId) return;
    const prev = saved;
    setSavePending(true);
    setSaved(!prev);
    haptics.select();
    // supabase-js resolves with { error } instead of throwing, so the previous
    // try/catch never fired and a failed save left the icon stuck flipped.
    const { error } = prev
      ? await supabase.from("saved_shots").delete().eq("user_id", currentUserId).eq("shot_id", reel.id)
      : await supabase.from("saved_shots").insert({ user_id: currentUserId, shot_id: reel.id });
    setSavePending(false);
    if (error) {
      setSaved(prev);
      showToast(prev ? "Couldn't unsave that Shot." : "Couldn't save that Shot.");
    }
  }

  async function deleteShot() {
    setOwnerAction("delete");
    const { error } = await supabase.from("shots").delete().eq("id", reel.id);
    setOwnerAction(null);
    if (error) return;
    setOwnerMenuOpen(false);
    setDeleted(true);
    setTimeout(onBack, 700);
  }

  async function toggleShotShowcase() {
    setOwnerAction("showcase");
    const next = !inShowcase;
    const { error } = await supabase.from("shots").update({ in_showcase: next }).eq("id", reel.id);
    setOwnerAction(null);
    if (!error) setInShowcase(next);
    setOwnerMenuOpen(false);
  }

  function togglePlay() {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().then(() => setPlaying(true)).catch(() => {});
    } else {
      el.pause();
      setPlaying(false);
    }
  }

  // Replay the burst without un-hyping (already hyped).
  function playBurst() {
    setHypeBurst(true);
    setShowParticles(true);
    setTimeout(() => setHypeBurst(false), 380);
    setTimeout(() => setShowParticles(false), 640);
  }

  // Single tap â†’ play/pause (slight delay), double tap â†’ Hype (add-only)
  function handleTap() {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      if (tapTimer.current) {
        clearTimeout(tapTimer.current);
        tapTimer.current = null;
      }
      lastTap.current = 0;
      if (!hyped && !hypePending && currentUserId) {
        toggleHype(); // burst handled inside
      } else {
        playBurst(); // already hyped â†’ replay burst, do NOT un-hype
      }
    } else {
      lastTap.current = now;
      if (tapTimer.current) clearTimeout(tapTimer.current);
      tapTimer.current = setTimeout(() => {
        togglePlay();
        tapTimer.current = null;
      }, 280);
    }
  }

  return (
    <section className="relative h-full w-full">
      <video
        ref={videoRef}
        src={reel.media_url}
        className="absolute inset-0 h-full w-full bg-black object-cover"
        loop
        muted={muted}
        playsInline
        preload={preload}
        onClick={handleTap}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          if (v.duration) setProgress(v.currentTime / v.duration);
        }}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => setBuffering(false)}
        onCanPlay={() => setBuffering(false)}
      />

      {/* Buffering spinner — only while actively loading the visible reel */}
      {buffering && isActive && playing && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <Loader2 size={40} className="animate-spin text-white/80" />
        </div>
      )}

      {/* Double-tap Hype burst â€” matches the feed */}
      {hypeBurst && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <Star
            size={88}
            className="animate-hype-pop text-hype drop-shadow-[0_4px_20px_rgba(255,208,0,0.5)]"
            fill="currentColor"
          />
        </div>
      )}

      {!playing && (
        <button
          type="button"
          onClick={togglePlay}
          aria-label="Play"
          className="absolute inset-0 z-10 flex items-center justify-center"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm">
            <Play size={30} className="ml-1 fill-white" />
          </span>
        </button>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

      {/* Back button — top-left */}
      <button
        type="button"
        onClick={onBack}
        aria-label="Go back"
        className="absolute left-3 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm"
      >
        <ChevronLeft size={22} />
      </button>

      {/* Mute toggle — top-right */}
      <button
        type="button"
        onClick={onToggleMute}
        aria-label={muted ? "Unmute" : "Mute"}
        className="absolute right-3 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm"
      >
        {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>

      {/* Right action rail */}
      <div className="absolute bottom-6 right-3 z-20 flex flex-col items-center gap-5">
        <RailButton
          label={hypeCount > 0 ? formatCount(hypeCount) : "Hype"}
          onClick={toggleHype}
          disabled={hypePending}
        >
          <span className="relative">
            <Star
              size={32}
              className={`${hypeBurst ? "animate-hype-burst" : ""} ${hyped ? "text-hype" : "text-white"}`}
              fill={hyped ? "currentColor" : "none"}
            />
            {showParticles && <HypeParticles size={10} />}
          </span>
        </RailButton>

        <RailButton
          label={commentCount > 0 ? formatCount(commentCount) : "Comment"}
          onClick={() => setCommentsOpen(true)}
        >
          <MessageCircle size={31} className="text-white" />
        </RailButton>

        <RailButton label="Share" onClick={() => setShareOpen(true)}>
          <Send size={29} className="text-white" />
        </RailButton>

        <RailButton label="Save" onClick={toggleSave} disabled={savePending}>
          <Bookmark size={30} className={saved ? "text-accent" : "text-white"} fill={saved ? "currentColor" : "none"} />
        </RailButton>

        {isOwner && (
          <RailButton label="More" onClick={() => setOwnerMenuOpen(true)}>
            <MoreHorizontal size={30} className="text-white" />
          </RailButton>
        )}
      </div>

      {/* Author + caption */}
      <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-2 p-4 pr-16">
        <Link href={handle ? `/u/${handle}` : "#"} className="flex items-center gap-2.5">
          <Avatar name={name} hue={hue} size={38} className="ring-2 ring-white/70" />
          <span className="text-sm font-bold text-white drop-shadow">
            {handle ? `@${handle}` : name}
          </span>
        </Link>
        {reel.caption && (
          <ExpandableText clampClass="line-clamp-2" className="text-sm text-white/90 drop-shadow" moreClassName="text-white/80">
            {reel.caption}
          </ExpandableText>
        )}
      </div>

      {/* Playback progress — thin accent bar hugging the bottom edge */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-[3px] bg-white/15">
        <div
          className="h-full bg-accent"
          style={{ width: `${Math.round(progress * 100)}%`, transition: "width 0.15s linear" }}
        />
      </div>

      {/* Deleted confirmation */}
      {deleted && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80">
          <p className="text-sm font-semibold text-white/80">Shot deleted</p>
        </div>
      )}

      {/* Owner actions menu — same pattern as ShowViewer */}
      {ownerMenuOpen && (
        <>
          <div className="absolute inset-0 z-30" onClick={() => setOwnerMenuOpen(false)} />
          <div className="absolute inset-x-4 bottom-8 z-40 overflow-hidden rounded-2xl bg-elevated/95 ring-1 ring-border backdrop-blur-xl">
            <button
              type="button"
              disabled={ownerAction !== null}
              onClick={toggleShotShowcase}
              className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-white/5 disabled:opacity-50"
            >
              {ownerAction === "showcase"
                ? <Loader2 size={20} className="animate-spin text-accent" />
                : inShowcase
                  ? <BookmarkCheck size={20} className="text-accent" />
                  : <Bookmark size={20} className="text-foreground" />}
              <div>
                <p className="text-sm font-semibold">{inShowcase ? "Remove from Showcase" : "Add to Showcase"}</p>
                <p className="text-xs text-muted">
                  {inShowcase ? "Remove from your profile highlights" : "Pin to your profile highlights"}
                </p>
              </div>
            </button>

            <div className="mx-4 h-px bg-border" />

            <button
              type="button"
              disabled={ownerAction !== null}
              onClick={deleteShot}
              className="flex w-full items-center gap-3 px-5 py-4 text-left text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
            >
              {ownerAction === "delete" ? <Loader2 size={20} className="animate-spin" /> : <Trash2 size={20} />}
              <div>
                <p className="text-sm font-semibold">Delete Shot</p>
                <p className="text-xs opacity-70">Removes this Shot permanently</p>
              </div>
            </button>

            <div className="mx-4 h-px bg-border" />

            <button
              type="button"
              onClick={() => setOwnerMenuOpen(false)}
              className="flex w-full items-center justify-center px-5 py-4 text-sm font-semibold text-muted transition-colors hover:bg-white/5"
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {/* Sheets */}
      {currentUserId && (
        <>
          <CommentsSheet
            open={commentsOpen}
            onClose={() => setCommentsOpen(false)}
            targetType="shot"
            postId={reel.id}
            postOwnerId={reel.user_id}
            currentUserId={currentUserId}
            onCountChange={setCommentCount}
          />
          <ShareSheet
            open={shareOpen}
            onClose={() => setShareOpen(false)}
            targetType="shot"
            postId={reel.id}
          />
        </>
      )}
    </section>
  );
}

function RailButton({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-1 transition-transform active:scale-90 disabled:opacity-60"
    >
      {children}
      <span className="text-xs font-semibold tabular-nums text-white drop-shadow">{label}</span>
    </button>
  );
}
