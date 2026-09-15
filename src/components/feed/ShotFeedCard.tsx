"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Play, VolumeX, Volume2, Star, MessageCircle } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Plane } from "@/components/ui/Plane";
import { CommentsSheet } from "@/components/feed/CommentsSheet";
import { ShareSheet } from "@/components/feed/ShareSheet";
import { ShareButton } from "@/components/feed/QuickShare";
import { HypeBreak } from "@/components/feed/HypeBreak";
import { HypeParticles } from "@/components/feed/HypeParticles";
import { createClient } from "@/lib/supabase/client";
import { hypeResult } from "@/lib/supabase/typed";
import { formatCount } from "@/lib/format";
import { haptics } from "@/lib/haptics";
import {
  isMuted,
  setMuted,
  subscribe,
  claimAudio,
  releaseAudio,
  ownsAudio,
} from "@/lib/shot-audio";
import type { ShotCard } from "@/lib/feed-mix";

/**
 * A Shot, sitting in the post feed.
 *
 * It plays where it sits, and tapping it opens the Shots viewer at this shot.
 *
 * Autoplay in a scrolling list is genuinely expensive — battery, and mobile
 * data spent on things the reader scrolls straight past — so it is bounded on
 * every side rather than simply switched on:
 *
 *  - **Only while actually on screen.** An IntersectionObserver at 60%
 *    visibility starts it and anything less pauses it. Mounting is not
 *    watching: cards mount well before they are visible, because the feed
 *    renders ahead with content-visibility.
 *  - **Nothing loads until it is close.** preload stays "none" until the card
 *    has been near the viewport once, so passing three shots on the way down
 *    a feed does not fetch three videos.
 *  - **Muted, always.** Sound belongs to the Shots tab, where you chose to be.
 *    A feed that starts talking is a feed people close.
 *  - **It stands down** only for Save-Data and 2g-class connections. Those are
 *    about someone's money. prefers-reduced-motion USED to block it too and
 *    that was wrong: Android turns that flag on with battery saver, so a very
 *    ordinary phone setting silently disabled the whole feature.
 *  - **It retries.** A refused play() is not final — browsers and WebViews
 *    gate autoplay behind a first interaction, so the next intersection and
 *    the first touch anywhere both try again.
 *  - **The poster is the video's own `poster`**, not a separate image layered
 *    under it. A paused video showing its poster frame looks identical to a
 *    playing one that has stopped; an image standing in for a video that
 *    failed to start looks like the feature working, which is exactly how a
 *    silent failure hides.
 *
 *  - **Sound is attempted, not assumed.** A Shot is made with sound and the
 *    feed should carry it, but a video that is not muted has its play()
 *    REFUSED until the page has been interacted with. So it asks for sound,
 *    and on refusal falls back to muted and shows the unmute control rather
 *    than simply not playing. Only one card is ever audible — see
 *    lib/shot-audio.
 *
 * Still no FeedImpression: post_views.post_id has a hard foreign key to
 * posts(id), so logging a shot there fails every time.
 *
 * Hype, comment and share live here now. They cost one extra query per shot
 * card for the viewer's own hype state, which FeedList's batch cannot supply
 * because it is keyed on post ids — a handful of shots per feed, fetched only
 * once a card is near the viewport.
 */

/** How much of the card must be visible before it plays. */
const PLAY_RATIO = 0.6;

/**
 * Whether autoplay is welcome, given what the device has told us.
 *
 * Split from the globals so the rule can be tested — the interesting cases
 * are "someone asked us not to", and those are exactly the ones nobody
 * reproduces by hand.
 */
export function autoplayAllowed(env: {
  saveData?: boolean;
  effectiveType?: string;
}): boolean {
  if (env.saveData) return false;
  // "2g" and "slow-2g". Video on either is a way of spending someone's
  // money without asking.
  if (env.effectiveType && /2g$/.test(env.effectiveType)) return false;
  return true;
}

function autoplayUnwelcome(): boolean {
  if (typeof window === "undefined") return true;
  const conn = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  return !autoplayAllowed({
    saveData: conn?.saveData,
    effectiveType: conn?.effectiveType,
  });
}

export function ShotFeedCard({
  shot,
  currentUserId,
}: {
  shot: ShotCard;
  currentUserId?: string;
}) {
  const supabase = createClient();
  const name =
    shot.profiles?.display_name ?? shot.profiles?.username ?? "Someone";
  const username = shot.profiles?.username;

  const [hyped, setHyped] = useState(false);
  const [hypeCount, setHypeCount] = useState(shot.hype_count ?? 0);
  const [hypePending, setHypePending] = useState(false);
  const [hypeBurst, setHypeBurst] = useState(false);
  const [showParticles, setShowParticles] = useState(false);
  const [hypeBreak, setHypeBreak] = useState(false);
  const [commentCount, setCommentCount] = useState(shot.comment_count ?? 0);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  /** Mirrors the shared preference so this card re-renders when it changes. */
  const [muted, setMutedState] = useState(true);
  /** Sound was asked for and the browser said no — until a gesture. */
  const [soundBlocked, setSoundBlocked] = useState(false);

  const wrapRef = useRef<HTMLAnchorElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  /** Set once the card has been near the viewport — gates the download. */
  const [armed, setArmed] = useState(false);
  const [playing, setPlaying] = useState(false);

  /** True while the card is the one on screen, so retries know to bother. */
  const inViewRef = useRef(false);

  // The mute preference and the audio owner both live outside React, because
  // they are shared by every card on the page. This mirrors them in.
  useEffect(() => {
    const sync = () => setMutedState(isMuted() || !ownsAudio(shot.id));
    sync();
    return subscribe(sync);
  }, [shot.id]);

  // Whether the viewer has already hyped this. Deferred until the card is
  // near the viewport so a feed of ten shots is not ten queries up front.
  useEffect(() => {
    if (!armed || !currentUserId) return;
    let live = true;
    supabase
      .from("hypes")
      .select("target_id")
      .eq("user_id", currentUserId)
      .eq("target_type", "shot")
      .eq("target_id", shot.id)
      .maybeSingle()
      .then(({ data }) => {
        if (live) setHyped(!!data);
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed, currentUserId, shot.id]);

  async function toggleHype() {
    if (hypePending || !currentUserId) return;
    const prev = hyped;
    const prevCount = hypeCount;
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
      haptics.tap();
      setHypeBreak(true);
      setTimeout(() => setHypeBreak(false), 520);
    }
    try {
      const { data, error } = await supabase.rpc("toggle_hype", {
        p_target_type: "shot",
        p_target_id: shot.id,
        p_owner_id: shot.user_id,
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

  /**
   * Play, asking for sound first.
   *
   * The order matters and is the whole trick. An unmuted play() is refused
   * outright until the page has a user gesture, and a refusal means NOTHING
   * plays — so trying sound first and falling back to muted is the only way
   * to get both "audible when allowed" and "always plays".
   */
  const attemptPlay = useCallback(async () => {
    const v = videoRef.current;
    if (!v || !inViewRef.current) return;

    const wantSound = !isMuted() && ownsAudio(shot.id);

    if (wantSound) {
      v.muted = false;
      v.removeAttribute("muted");
      try {
        await v.play();
        setSoundBlocked(false);
        setPlaying(true);
        return;
      } catch {
        // Refused for being audible. Fall through and play silently rather
        // than leaving a dead frame on screen.
        setSoundBlocked(true);
      }
    }

    // React sets `muted` as a DOM property but does not always reflect it as
    // an attribute, and autoplay policies read the attribute. Setting it both
    // ways is the difference between playing and being refused.
    v.muted = true;
    v.setAttribute("muted", "");
    try {
      await v.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  }, [shot.id]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (autoplayUnwelcome()) return;

    const attempt = () => void attemptPlay();

    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        // Arm on the first sighting, at any ratio: this is what lets the
        // video start loading slightly before it is due to play, without
        // loading every shot in the list.
        if (entry.isIntersecting) setArmed(true);

        const v = videoRef.current;
        if (!v) return;

        if (entry.intersectionRatio >= PLAY_RATIO) {
          inViewRef.current = true;
          // The card you are looking at is the one that should be heard.
          claimAudio(shot.id);
          attempt();
        } else {
          inViewRef.current = false;
          releaseAudio(shot.id);
          if (!v.paused) {
            v.pause();
            setPlaying(false);
          }
        }
      },
      // Two thresholds: one to arm, one to play.
      { threshold: [0, PLAY_RATIO] }
    );

    io.observe(el);

    // Autoplay is commonly gated behind a first interaction — notably in the
    // Android WebView the native shell runs in, where nothing plays on its own
    // until the user has touched the page once. One retry on the first touch
    // costs nothing and is the difference between working and not.
    const unlock = () => attempt();
    document.addEventListener("pointerdown", unlock, {
      once: true,
      passive: true,
    });
    document.addEventListener("touchstart", unlock, {
      once: true,
      passive: true,
    });

    return () => {
      io.disconnect();
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("touchstart", unlock);
      releaseAudio(shot.id);
      const v = videoRef.current;
      if (v && !v.paused) v.pause();
    };
  }, [attemptPlay, shot.id]);

  // Re-apply the mute state to the element whenever the shared preference or
  // the audio owner changes, without restarting playback.
  //
  // No early return on `v.muted` already matching: React's muted={muted} prop
  // has by this point set the PROPERTY, so a check like that always matches
  // and would skip the two things this effect is actually for — keeping the
  // attribute in sync, and finding out whether the unmute was allowed.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const wantSound = !muted;

    v.muted = !wantSound;
    // The attribute, separately: autoplay policy reads the attribute rather
    // than the property, so the next play() depends on it being right.
    if (wantSound) v.removeAttribute("muted");
    else v.setAttribute("muted", "");

    if (!wantSound) {
      setSoundBlocked(false);
      return;
    }

    // Turning sound ON mid-playback can be refused, and the browser's way of
    // refusing is to pause or re-mute — leaving the button saying "Mute" over
    // a silent video. Re-asserting through play() is how we find out, and if
    // it is refused we put the shared preference back rather than showing a
    // state the element does not have.
    if (v.paused) return;
    void v.play().then(
      () => setSoundBlocked(false),
      () => {
        v.muted = true;
        v.setAttribute("muted", "");
        setSoundBlocked(true);
        setMuted(true);
      }
    );
  }, [muted]);

  // A backgrounded tab keeps firing nothing, so the observer never tells us to
  // stop. Without this a shot carries on decoding while the phone is locked.
  useEffect(() => {
    function onHidden() {
      if (document.visibilityState !== "hidden") return;
      const v = videoRef.current;
      if (v && !v.paused) {
        v.pause();
        setPlaying(false);
      }
    }
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, []);

  return (
    <article className="relative border-b border-border/50 pb-3">
      {/* Header mirrors FeedCard's so a Shot reads as feed furniture rather
          than as an interruption. */}
      <div className="flex items-center gap-3 px-4 py-3">
        <Avatar
          name={name}
          hue={shot.profiles?.avatar_hue ?? 280}
          src={shot.profiles?.avatar_url ?? undefined}
          size={40}
        />
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <span className="truncate text-sm font-semibold">{name}</span>
          {username && (
            <span className="truncate text-xs text-faint">@{username}</span>
          )}
        </div>
        <span className="flex items-center gap-1 rounded-pill bg-surface px-2 py-0.5 text-[10px] font-black tracking-wide text-muted">
          <Play size={9} fill="currentColor" /> SHOT
        </span>
      </div>

      <Link
        ref={wrapRef}
        href={`/shots/${shot.id}`}
        prefetch={false}
        aria-label={`Open ${name}'s Shot`}
        /* 4:5, not the Shot's native 9:16. A true 9:16 tile is about 1.7
           viewports tall on a phone — one Shot would fill the screen and the
           feed would stop being a feed. This is the same shape band FeedCard
           uses for its gallery, so the two sit together. */
        className="relative mx-4 block aspect-[4/5] overflow-hidden rounded-2xl bg-black"
      >
        {/* One element, not a video hidden behind an image.

            This used to fade the video in only once `playing` was true, with
            the poster as a separate <img> underneath — which meant a video
            that never started looked exactly like one that had, and the whole
            feature could be broken without leaving a trace on screen. The
            video's own `poster` covers the not-yet-playing case, so what you
            see is always the real element. */}
        <video
          ref={videoRef}
          src={shot.media_url}
          poster={shot.poster_url ?? undefined}
          // Bound to state, NOT hardcoded. React re-applies its props on
          // every render, so a literal `muted` here would quietly re-mute the
          // element the next time anything in this card re-rendered — the
          // toggle would appear to work and the sound would not come back.
          muted={muted}
          loop
          playsInline
          // Deliberately NO autoPlay attribute. React sets `muted` as a DOM
          // property and does not emit it as an attribute, so server-rendered
          // markup would carry `autoplay` WITHOUT `muted` — which every
          // autoplay policy reads as "wants to make noise" and refuses. The
          // effect below sets the muted attribute first and then plays, which
          // is the only ordering that reliably works.
          //
          // Nothing is fetched until the card has been near the viewport.
          preload={armed ? "metadata" : "none"}
          className="absolute inset-0 h-full w-full object-cover"
        />

        {/* Scrim so the glyphs and counts stay legible on a bright frame */}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent" />

        {/* The play affordance is for the paused state only — once it is
            moving, an overlaid play button is a lie about what tapping does. */}
        {!playing && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm">
              <Play size={26} className="ml-1" fill="currentColor" />
            </span>
          </span>
        )}

        {/* Sound, and the fact that you can have it.
            This used to be a VolumeX glyph with no handler — a statement that
            the feed is silent, offering nothing to do about it.

            preventDefault as well as stopPropagation: the button sits inside
            the Link that opens the Shots viewer, and without both, muting
            navigates away from the thing you were watching. */}
        <button
          type="button"
          aria-label={muted ? "Unmute" : "Mute"}
          aria-pressed={!muted}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            haptics.tap();
            // Claim the sound as well as unmuting: tapping unmute on THIS
            // card means you want to hear THIS one, even if another card
            // last claimed it.
            if (muted) claimAudio(shot.id);
            setMuted(!muted);
          }}
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-transform active:scale-90"
        >
          {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>

        {/* Only when the browser actually refused. A permanent "tap for
            sound" hint on a card that is already audible would be noise. */}
        {soundBlocked && muted && (
          <span className="pointer-events-none absolute right-3 top-14 rounded-full bg-black/50 px-2 py-1 text-[10px] font-bold text-white backdrop-blur-sm">
            Tap for sound
          </span>
        )}
      </Link>

      {/* The same actions in the same order as a post card, so a Shot is
          something you can respond to where you find it rather than a
          trailer for the Shots tab. */}
      <div className="flex items-center gap-1 px-3 pt-2">
        <button
          type="button"
          onClick={toggleHype}
          disabled={hypePending || !currentUserId}
          aria-pressed={hyped}
          aria-label={hyped ? "Remove hype" : "Hype"}
          className={`flex h-10 items-center gap-1.5 rounded-full px-2 transition-colors active:scale-95 disabled:opacity-50 ${
            hyped ? "text-hype" : "text-foreground hover:bg-white/5"
          }`}
        >
          <span className="relative">
            <Star
              size={22}
              strokeWidth={2.2}
              className={
                hypeBurst
                  ? "animate-hype-burst"
                  : hypeBreak
                  ? "animate-hype-crack"
                  : ""
              }
              fill={hyped ? "currentColor" : "none"}
            />
            {showParticles && <HypeParticles size={9} />}
            {hypeBreak && <HypeBreak size={22} />}
          </span>
          {hypeCount > 0 && (
            <span className="text-xs font-semibold tabular-nums">
              {formatCount(hypeCount)}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setCommentsOpen(true)}
          disabled={!currentUserId}
          aria-label="Comments"
          className="flex h-10 items-center gap-1.5 rounded-full px-2 text-foreground transition-colors hover:bg-white/5 active:scale-95 disabled:opacity-50"
        >
          <MessageCircle size={22} strokeWidth={2.2} />
          {commentCount > 0 && (
            <span className="text-xs font-semibold tabular-nums">
              {formatCount(commentCount)}
            </span>
          )}
        </button>

        <ShareButton
          postId={shot.id}
          targetType="shot"
          onOpenSheet={() => setShareOpen(true)}
          className="flex h-10 items-center justify-center rounded-full px-2 text-foreground transition-colors hover:bg-white/5 active:scale-95"
        >
          <Plane size={21} weight="bold" />
        </ShareButton>
      </div>

      {shot.caption && (
        <p className="line-clamp-2 px-4 pt-1 text-sm leading-snug text-foreground/85">
          {shot.caption}
        </p>
      )}

      {currentUserId && (
        <>
          <CommentsSheet
            open={commentsOpen}
            onClose={() => setCommentsOpen(false)}
            targetType="shot"
            postId={shot.id}
            postOwnerId={shot.user_id}
            currentUserId={currentUserId}
            onCountChange={setCommentCount}
          />
          <ShareSheet
            open={shareOpen}
            onClose={() => setShareOpen(false)}
            targetType="shot"
            postId={shot.id}
          />
        </>
      )}
    </article>
  );
}
