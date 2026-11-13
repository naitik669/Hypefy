"use client";

import { useRouter } from "next/navigation";
import { safeBack } from "@/lib/safe-back";
import { ChevronLeft } from "lucide-react";
import { hideStyle, useHideOnScroll } from "@/lib/use-hide-on-scroll";

/**
 * Sticky page header: optional back button, title, optional right slot.
 *
 * It slides away going down and comes back going up, which is why this
 * one change reaches 33 routes at once — settings, Discover, Activity,
 * Help and the rest all draw their header through here.
 *
 * The back arrow goes with it. On Android the hardware button is the way
 * out regardless; elsewhere a few pixels of upward scroll brings the
 * arrow back, which is the same gesture as reaching for it.
 *
 * Every caller draws a title and an optional back arrow and nothing else —
 * the composer included, which I had assumed held its Post button here and
 * does not. So there is no opt-out: nothing needed one.
 */
export function PageHeader({
  title,
  showBack = false,
  onBack,
  right,
}: {
  title: string;
  showBack?: boolean;
  /** Override what the arrow does. For screens with internal steps, so the
   *  single back arrow retreats a step before it leaves the screen, instead
   *  of the screen needing a second back control of its own. */
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  const router = useRouter();
  const hidden = useHideOnScroll();

  return (
    <header
      className="sticky top-0 z-20 flex h-[calc(3.5rem+var(--sat))] items-center gap-1 border-b border-border/60 chrome-bar px-2 pt-[var(--sat)] will-change-transform motion-reduce:transition-none"
      style={hideStyle(hidden)}
    >
      {showBack ? (
        <button
          type="button"
          onClick={() => (onBack ? onBack() : safeBack(router))}
          aria-label="Back"
          className="flex h-10 w-10 items-center justify-center rounded-full text-foreground transition-colors hover:bg-white/5"
        >
          <ChevronLeft size={24} />
        </button>
      ) : (
        <span className="w-2" />
      )}
      <h1 className="flex-1 truncate px-1 text-[17px] font-extrabold tracking-tight">{title}</h1>
      {right && <div className="flex items-center gap-1">{right}</div>}
    </header>
  );
}
