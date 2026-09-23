"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowUp, Compass, PlusCircle, RotateCw } from "lucide-react";
import { haptics } from "@/lib/haptics";
import { ctaClass } from "@/components/empty/EmptyScene";
import { CompassTickArt } from "@/components/empty/scenes";
import s from "@/components/empty/empty.module.css";

const delay = (seconds: number) => ({ ["--d" as string]: `${seconds}s` }) as React.CSSProperties;

/**
 * End-of-feed moment. The first time it scrolls into view the Discover
 * compass pops up, spins to north and turns into the lime tick, then the
 * words and buttons arrive in turn; tapping the badge replays the compass,
 * and Back to top does what it says.
 */
export function CaughtUp({
  count = 0,
  where = "home",
}: {
  count?: number;
  /** On Discover the way on is fresh finds, so Refresh replaces Discover more. */
  where?: "home" | "discover";
}) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  const [replay, setReplay] = useState(0);
  const onDiscover = where === "discover";

  function refresh() {
    haptics.tap();
    window.scrollTo({ top: 0, behavior: "smooth" });
    // Re-runs the server query, so this lands on a genuinely current feed,
    // not just the top of the stale one.
    router.refresh();
  }

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Without an observer there is no way to know when this scrolls into
    // view, so show it rather than leaving the end of the feed blank.
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
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
    <div ref={ref}>
      {/* Always in the page, so it takes its space and can be read; hidden
          until it scrolls into view, and re-mounted at that moment so the
          scene plays from its start rather than part-way through. */}
      <div
        key={seen ? "in" : "out"}
        className={`flex flex-col items-center gap-2 px-6 py-12 text-center ${seen ? "" : "invisible"}`}
      >
          <button
            type="button"
            aria-label="You're all caught up. Tap to replay"
            onClick={() => {
              haptics.tap();
              setReplay((r) => r + 1);
            }}
            className="transition-transform active:scale-90"
          >
            {/* key re-mounts the compass so it spins into the tick again */}
            <span key={replay} className="block">
              <CompassTickArt />
            </span>
          </button>

          <h2 className={`${s.head} text-[17px] font-extrabold tracking-[-0.02em]`} style={delay(1.55)}>
            You&apos;re all caught up<span className="text-accent">.</span>
          </h2>
          {/* Says what was actually covered rather than just stopping. The feed
              is deliberately allowed to run out, so the end has to read as an
              achievement with somewhere to go, not as the app running dry. */}
          <p className={`${s.sub} text-[13px] text-muted`} style={delay(1.85)}>
            {onDiscover
              ? "You've seen everything for now. Refresh for fresh finds."
              : count > 0
              ? `That's all ${count} ${count === 1 ? "post" : "posts"}. Nothing left unread.`
              : "New posts land here as your circle gets loud."}
          </p>

          {/* Two real destinations. Discover has things this feed did not show
              you, and composing is the only way the feed gets longer for
              everyone else. */}
          <div className="mt-1.5 flex items-center gap-2">
            <div className={`${s.cta} rounded-[14px]`} style={delay(2.15)}>
              {onDiscover ? (
                <button type="button" onClick={refresh} className={ctaClass}>
                  <RotateCw size={15} /> Refresh
                </button>
              ) : (
                <Link href="/discover" onClick={() => haptics.tap()} className={ctaClass}>
                  <Compass size={15} /> Discover more
                </Link>
              )}
            </div>
            <div className={s.pop} style={delay(2.3)}>
              <Link
                href="/create/post"
                onClick={() => haptics.tap()}
                className="inline-flex items-center gap-1.5 rounded-[14px] border border-border px-5 py-2.5 text-sm font-bold text-muted transition-colors hover:border-white/25 hover:text-foreground"
              >
                <PlusCircle size={15} /> Post
              </Link>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (onDiscover) {
                // Refresh already reloads; this one just goes back up.
                haptics.tap();
                window.scrollTo({ top: 0, behavior: "smooth" });
              } else refresh();
            }}
            className={`${s.sub} mt-1 flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold text-faint transition-colors hover:text-foreground`}
            style={delay(2.5)}
          >
            <ArrowUp size={13} /> Back to top
          </button>
      </div>
    </div>
  );
}
