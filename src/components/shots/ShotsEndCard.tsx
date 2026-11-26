"use client";

import Link from "next/link";
import { Check, Compass, Loader2, Plus, RefreshCw, RotateCcw } from "lucide-react";

export type NewCheck = "idle" | "checking" | "none";

/**
 * Where the reel runs out.
 *
 * Two places it can appear, as a slide of its own rather than a sheet over
 * the last Shot, which may still be being watched:
 *
 *   caught-up   between the new Shots and the ones already watched. "Keep
 *               watching" carries on into the earlier ones.
 *   end         after the very last one. Watch again (reshuffled), check
 *               for anything posted since, or go and find more people.
 *
 * While there are few Shots on Hypefy, making one is the main button: the
 * honest fix for a short reel is another Shot in it.
 */
export function ShotsEndCard({
  variant,
  thin,
  total,
  check,
  onAgain,
  onCheck,
  onContinue,
  newCount = 0,
  watchedCount = 0,
  abovePoster = null,
  belowPoster = null,
}: {
  variant: "caught-up" | "end";
  /** Few Shots exist: lead with "Make a Shot". */
  thin: boolean;
  /**
   * How many Shots the reel held.
   *
   * Said out loud, because "That's every Shot for now" next to a big Make a
   * Shot button reads as "there are no Shots" — which is what it was
   * reported as. Nobody reads "That's all 9 Shots for now" that way.
   */
  total: number;
  check: NewCheck;
  onAgain: () => void;
  onCheck: () => void;
  /** caught-up only: on into the Shots already watched. */
  onContinue?: () => void;
  /** caught-up only: how many new Shots were just watched, and how many watched ones follow. */
  newCount?: number;
  watchedCount?: number;
  /**
   * caught-up only: the posters of the Shots either side of this card.
   *
   * They are what make it read as a divider between two stretches of reel
   * rather than a wall with the reel stopped behind it. Absent (a Shot with
   * no poster yet) each band falls back to a plain wash, which still shows
   * the card sits between two things.
   */
  abovePoster?: string | null;
  belowPoster?: string | null;
}) {
  const main = "flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-sm font-extrabold text-accent-ink active:scale-[0.99]";
  const quiet = "flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white/10 text-sm font-bold text-white active:scale-[0.99]";

  // Not thin: a reel of nine is "thin" by THIN_REEL's reckoning, and
  // leading with Make a Shot there is what made the card read as an empty
  // state. Only a reel with almost nothing in it leads with making one.
  const bare = total < 5;
  const make = (
    <Link href="/create?mode=shot" className={bare ? main : quiet} data-end-make>
      <Plus size={17} strokeWidth={2.6} /> Make a Shot
    </Link>
  );
  const again = (
    <button type="button" onClick={onAgain} className={bare ? quiet : main} data-end-again>
      <RotateCcw size={16} strokeWidth={2.4} /> Watch again
    </button>
  );

  /*
   * Where the new Shots end.
   *
   * A divider, not an end: the last new Shot is above, the first watched
   * one below, and the eye is meant to carry on down. The old card was the
   * same full-stop screen as the end of the reel — big mark, two buttons —
   * which is what made it read as "there is nothing here" in the middle of
   * a reel that had more to play.
   */
  if (variant === "caught-up") {
    const band = "relative mx-3.5 h-[150px] shrink-0 overflow-hidden bg-cover bg-center";
    return (
      <div data-shots-end={variant} className="flex h-full w-full flex-col bg-black text-white">
        <div
          className={`${band} rounded-b-[18px]`}
          style={abovePoster ? { backgroundImage: `url(${abovePoster})` } : { background: "linear-gradient(0deg, rgba(255,255,255,0.04), rgba(255,255,255,0.14))" }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-transparent" />
          <span className="absolute left-3.5 top-3 text-[11px] font-extrabold uppercase tracking-wider text-white/70">
            Last new Shot
          </span>
        </div>

        <div className="flex grow flex-col items-center justify-center px-9 text-center">
          <div className="flex w-full items-center gap-3">
            <span className="h-px grow bg-white/20" />
            <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink">
              <Check size={18} strokeWidth={3.2} />
            </span>
            <span className="h-px grow bg-white/20" />
          </div>
          <h2 className="mt-[18px] text-2xl font-extrabold tracking-tight">You&rsquo;re all caught up</h2>
          <p className="mt-2 max-w-[28ch] text-sm leading-relaxed text-white/60">
            {newCount === 1 ? "That new Shot watched." : `All ${newCount} new Shots watched.`}
            {watchedCount > 0
              ? ` Below ${watchedCount === 1 ? "is 1 Shot" : `are ${watchedCount} Shots`} from before.`
              : ""}
          </p>
          <Link
            href="/create?mode=shot"
            data-end-make
            className="mt-5 flex h-11 items-center gap-2 rounded-full bg-white/10 px-[18px] text-sm font-bold text-white active:scale-[0.99]"
          >
            <Plus size={16} strokeWidth={2.6} /> Make a Shot
          </Link>
        </div>

        {/* Tapping the lower band is the same move as swiping up onto it. */}
        <button
          type="button"
          onClick={onContinue}
          data-end-continue
          aria-label="Keep watching Shots you have seen before"
          className={`${band} mb-2.5 block w-[calc(100%-1.75rem)] rounded-t-[18px] text-left`}
          style={belowPoster ? { backgroundImage: `url(${belowPoster})` } : { background: "linear-gradient(180deg, rgba(255,255,255,0.14), rgba(255,255,255,0.04))" }}
        >
          <span className="absolute inset-0 bg-gradient-to-b from-black via-black/35 to-transparent" />
          <span className="absolute inset-x-0 bottom-3.5 text-center text-xs font-bold text-white/75">
            Swipe up &middot; watched before
          </span>
        </button>
      </div>
    );
  }

  return (
    <div data-shots-end={variant} className="flex h-full w-full flex-col items-center justify-center bg-black px-8 text-center text-white">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-2xl font-black">
        H<span className="text-accent">.</span>
      </span>
      <h2 className="mt-5 text-xl font-extrabold tracking-tight">You&rsquo;re all caught up</h2>
      <p className="mt-1.5 max-w-[28ch] text-sm leading-relaxed text-white/60">
        {`That's all ${total} Shot${total === 1 ? "" : "s"} for now.${
          thin ? " The reel is short — add one of yours." : ""
        }`}
      </p>

      <div className="mt-6 flex w-full max-w-[280px] flex-col gap-2">
        {bare ? make : again}
        {bare ? again : make}
        <Link href="/discover" className="flex h-11 w-full items-center justify-center gap-2 text-sm font-bold text-white/70">
          <Compass size={16} /> Find people to follow
        </Link>
      </div>

      <button
        type="button"
        onClick={onCheck}
        disabled={check === "checking"}
        data-end-check
        className="mt-5 flex h-9 items-center gap-2 rounded-full px-3 text-xs font-bold text-white/55"
      >
        {check === "checking" ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
        {check === "none" ? "Nothing new yet" : check === "checking" ? "Checking" : "Check for new Shots"}
      </button>
    </div>
  );
}
