"use client";

import { useRef, useState } from "react";
import { reloadIfNewBuild } from "@/lib/app-version";
import { useRouter } from "next/navigation";
import { HypefyMark } from "@/components/HypefyMark";

const THRESHOLD = 70;
const MAX_PULL = 110;

/**
 * Touch pull-to-refresh. Only engages when the page is scrolled to the top;
 * pulling past the threshold triggers a refresh. By default that's
 * router.refresh() (re-runs the server-component query); pass `onRefresh` for
 * client-loaded pages to re-run their own fetch — its promise gates the spinner.
 */
export function PullToRefresh({
  children,
  onRefresh,
}: {
  children: React.ReactNode;
  onRefresh?: () => void | Promise<void>;
}) {
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
      const release = () => { setRefreshing(false); setPull(0); };
      if (onRefresh) {
        // Gate the spinner on the caller's own fetch completing.
        Promise.resolve(onRefresh()).finally(() => setTimeout(release, 250));
      } else {
        // Pulling to refresh also picks up a new release of the app itself.
        void reloadIfNewBuild();
        router.refresh();
        // router.refresh() has no completion callback — release after a beat
        setTimeout(release, 1200);
      }
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
