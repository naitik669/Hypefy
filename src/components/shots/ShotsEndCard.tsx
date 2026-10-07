"use client";

import Link from "next/link";
import { ChevronDown, Compass, Loader2, Plus, RefreshCw, RotateCcw } from "lucide-react";

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
  check,
  onAgain,
  onCheck,
  onContinue,
}: {
  variant: "caught-up" | "end";
  /** Few Shots exist: lead with "Make a Shot". */
  thin: boolean;
  check: NewCheck;
  onAgain: () => void;
  onCheck: () => void;
  /** caught-up only: on into the Shots already watched. */
  onContinue?: () => void;
}) {
  const main = "flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-sm font-extrabold text-accent-ink active:scale-[0.99]";
  const quiet = "flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white/10 text-sm font-bold text-white active:scale-[0.99]";

  const make = (
    <Link href="/create?mode=shot" className={thin ? main : quiet} data-end-make>
      <Plus size={17} strokeWidth={2.6} /> Make a Shot
    </Link>
  );
  const again = (
    <button type="button" onClick={onAgain} className={thin ? quiet : main} data-end-again>
      <RotateCcw size={16} strokeWidth={2.4} /> Watch again
    </button>
  );

  return (
    <div data-shots-end={variant} className="flex h-full w-full flex-col items-center justify-center bg-black px-8 text-center text-white">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-2xl font-black">
        H<span className="text-accent">.</span>
      </span>
      <h2 className="mt-5 text-xl font-extrabold tracking-tight">You&rsquo;re all caught up</h2>
      <p className="mt-1.5 max-w-[28ch] text-sm leading-relaxed text-white/60">
        {variant === "caught-up"
          ? "That's every new Shot. The ones you've watched are below."
          : thin
            ? "That's every Shot for now. The reel is short: add one of yours."
            : "That's every Shot for now."}
      </p>

      <div className="mt-6 flex w-full max-w-[280px] flex-col gap-2">
        {variant === "caught-up" ? (
          <>
            <button type="button" onClick={onContinue} className={thin ? quiet : main} data-end-continue>
              <ChevronDown size={18} strokeWidth={2.6} /> Keep watching
            </button>
            {make}
          </>
        ) : (
          <>
            {thin ? make : again}
            {thin ? again : make}
            <Link href="/discover" className="flex h-11 w-full items-center justify-center gap-2 text-sm font-bold text-white/70">
              <Compass size={16} /> Find people to follow
            </Link>
          </>
        )}
      </div>

      {variant === "end" && (
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
      )}
    </div>
  );
}
