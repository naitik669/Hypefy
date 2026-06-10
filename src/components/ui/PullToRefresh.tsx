"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { HypefyMark } from "@/components/HypefyMark";

const THRESHOLD = 70;
const MAX_PULL = 110;

/**
 * Touch pull-to-refresh. Only engages when the page is scrolled to the top;
 * pulling past the threshold triggers router.refresh() (re-runs the server
 * component query).
 */
export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);

  function onTouchStart(e: React.TouchEvent) {
    if (window.scrollY > 2 || refreshing) return;
    startY.current = e.touches[0].clientY;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (startY.current === null || refreshing) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy <= 0 || window.scrollY > 2) { setPull(0); return; }
    // Rubber-band: diminishing returns past the threshold
    setPull(Math.min(dy * 0.55, MAX_PULL));
  }

  function onTouchEnd() {
    if (startY.current === null) return;
    startY.current = null;
    if (pull >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPull(48); // hold the spinner visible
      router.refresh();
      // router.refresh() has no completion callback — release after a beat
      setTimeout(() => { setRefreshing(false); setPull(0); }, 1200);
    } else {
      setPull(0);
    }
  }

  const armed = pull >= THRESHOLD;

  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      {/* Pull indicator */}
      <div
        className="pointer-events-none flex items-end justify-center overflow-hidden transition-[height] duration-150"
        style={{ height: pull, transitionDuration: startY.current ? "0ms" : "200ms" }}
      >
        <div className="pb-3">
          <HypefyMark
            spin={refreshing || armed}
            className={`h-7 w-7 transition-colors ${armed || refreshing ? "text-accent" : "text-faint"}`}
          />
        </div>
      </div>
      {children}
    </div>
  );
}
