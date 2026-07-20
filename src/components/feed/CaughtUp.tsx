"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { haptics } from "@/lib/haptics";

/**
 * End-of-feed moment. Plays its entrance (badge springs in, ring and check
 * draw themselves) the first time it scrolls into view; tapping the badge
 * replays it, and Back to top does what it says.
 */
export function CaughtUp() {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  const [replay, setReplay] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          obs.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} className="flex flex-col items-center gap-2.5 px-6 py-12 text-center">
      <button
        type="button"
        aria-label="You're all caught up. Tap to replay"
        onClick={() => {
          haptics.tap();
          setReplay((r) => r + 1);
        }}
        className="transition-transform active:scale-90"
      >
        {/* key re-mounts the SVG so the draw animation replays on tap */}
        <span key={replay} className={seen ? "animate-caughtup-pop block" : "block opacity-0"}>
          <svg width="52" height="52" viewBox="0 0 52 52" fill="none" aria-hidden>
            <circle
              cx="26" cy="26" r="20"
              stroke="var(--color-accent, #a3e635)" strokeWidth="2.5" strokeLinecap="round"
              className={seen ? "caughtup-ring" : undefined}
              transform="rotate(-90 26 26)"
            />
            <path
              d="M18 26.5l5.5 5.5L34 21"
              stroke="var(--color-accent, #a3e635)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className={seen ? "caughtup-check" : undefined}
            />
          </svg>
        </span>
      </button>

      <div className={seen ? "animate-row-in" : "opacity-0"} style={{ animationDelay: "250ms" }}>
        <p className="text-sm font-bold">You&apos;re all caught up</p>
        <p className="mt-0.5 text-xs text-muted">New posts land here as your circle gets loud.</p>
      </div>

      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className={`mt-1 flex items-center gap-1.5 rounded-xl border border-border px-3.5 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-white/25 hover:text-foreground ${
          seen ? "animate-row-in" : "opacity-0"
        }`}
        style={{ animationDelay: "400ms" }}
      >
        <ArrowUp size={13} /> Back to top
      </button>
    </div>
  );
}
