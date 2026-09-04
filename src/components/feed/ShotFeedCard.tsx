"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Play, VolumeX } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { formatCount } from "@/lib/format";
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
 * Still no FeedImpression: post_views.post_id has a hard foreign key to
 * posts(id), so logging a shot there fails every time. And no hype/save
 * buttons — the counts are static text, the real controls are one tap away,
 * which is what keeps this card out of FeedList's post-keyed batch queries.
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

export function ShotFeedCard({ shot }: { shot: ShotCard }) {
  const name =
    shot.profiles?.display_name ?? shot.profiles?.username ?? "Someone";
  const username = shot.profiles?.username;
  const hypes = shot.hype_count ?? 0;
  const comments = shot.comment_count ?? 0;

  const wrapRef = useRef<HTMLAnchorElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  /** Set once the card has been near the viewport — gates the download. */
  const [armed, setArmed] = useState(false);
  const [playing, setPlaying] = useState(false);

  /** True while the card is the one on screen, so retries know to bother. */
  const inViewRef = useRef(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (autoplayUnwelcome()) return;

    function attempt() {
      const v = videoRef.current;
      if (!v || !inViewRef.current) return;
      // React sets `muted` as a DOM property but does not always reflect it
      // as an attribute, and autoplay policies read the attribute. Setting it
      // both ways is the difference between playing and being refused.
      v.muted = true;
      v.setAttribute("muted", "");
      void v
        .play()
        .then(() => setPlaying(true))
        .catch(() => setPlaying(false));
    }

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
          attempt();
        } else {
          inViewRef.current = false;
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
    document.addEventListener("pointerdown", unlock, { once: true, passive: true });
    document.addEventListener("touchstart", unlock, { once: true, passive: true });

    return () => {
      io.disconnect();
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("touchstart", unlock);
      const v = videoRef.current;
      if (v && !v.paused) v.pause();
    };
  }, []);

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
          muted
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

        {/* Says why it is silent, and that sound exists elsewhere. */}
        {playing && (
          <span className="pointer-events-none absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm">
            <VolumeX size={14} />
          </span>
        )}

        {(hypes > 0 || comments > 0) && (
          <span className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-3 text-[11px] font-semibold text-white/90">
            {hypes > 0 && <span>{formatCount(hypes)} hypes</span>}
            {comments > 0 && <span>{formatCount(comments)} comments</span>}
          </span>
        )}
      </Link>

      {shot.caption && (
        <p className="line-clamp-2 px-4 pt-2 text-sm leading-snug text-foreground/85">
          {shot.caption}
        </p>
      )}
    </article>
  );
}
