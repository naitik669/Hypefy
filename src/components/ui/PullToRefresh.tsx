"use client";

import { useRef, useState } from "react";
import { reloadIfNewBuild } from "@/lib/app-version";
import { useRouter } from "next/navigation";
import { lockAxis } from "@/components/layout/SwipeNav";
import { HypefyMark } from "@/components/HypefyMark";
import { Lock } from "lucide-react";
import { haptics } from "@/lib/haptics";
import { VAULT_HOLD_MS } from "@/lib/chat-vault";

/** Heard by anything that wants to know a pull has started (see LockedChatsRow). */
export const PULL_EVENT = "hypefy:pulled";

const THRESHOLD = 70;
const MAX_PULL = 110;
/** How far the pull must be held for the second action: nearly its full stretch. */
const HOLD_AT = 100;

/**
 * Touch pull-to-refresh. Only engages when the page is scrolled to the top;
 * pulling past the threshold triggers a refresh. By default that's
 * router.refresh() (re-runs the server-component query); pass `onRefresh` for
 * client-loaded pages to re-run their own fetch — its promise gates the spinner.
 *
 * `holdTo` gives the pull a second meaning: pulled to (nearly) its full
 * stretch and HELD there for a moment, it goes to that address instead of
 * refreshing. Letting go before the moment is up is an ordinary refresh, so
 * nothing about the usual gesture changes. Messages uses it for the Vault,
 * which has no button anywhere. It takes an address rather than a callback
 * because the pages that use this are drawn on the server.
 */
export function PullToRefresh({
  children,
  onRefresh,
  holdTo,
}: {
  children: React.ReactNode;
  onRefresh?: () => void | Promise<void>;
  /** Where a pull that is held goes. Absent, a pull only ever refreshes. */
  holdTo?: string;
}) {
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const startX = useRef(0);
  /** Which way this gesture is going, once it is clear. A sideways swipe
   *  between tabs never pulls, however much the thumb dips on the way. */
  const axis = useRef<null | "x" | "y">(null);
  /** Whether this gesture has already said it is a pull. */
  const announced = useRef(false);
  /** The hold: counting, and whether it has already fired for this gesture. */
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const [holding, setHolding] = useState(false);

  function stopHold() {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    setHolding(false);
  }

  function onTouchStart(e: React.TouchEvent) {
    axis.current = null;
    announced.current = false;
    held.current = false;
    if (window.scrollY > 2 || refreshing) return;
    startY.current = e.touches[0].clientY;
    startX.current = e.touches[0].clientX;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (startY.current === null || refreshing) return;
    const dy = e.touches[0].clientY - startY.current;
    if (axis.current === null) {
      axis.current = lockAxis(e.touches[0].clientX - startX.current, dy);
      if (axis.current === null) return;
    }
    if (axis.current === "x") {
      if (pull) setPull(0);
      stopHold();
      return;
    }
    if (dy <= 0 || window.scrollY > 2) { setPull(0); stopHold(); return; }
    // Rubber-band: diminishing returns past the threshold
    const next = Math.min(dy * 0.55, MAX_PULL);
    // Told once per gesture, as soon as it is clearly a pull: Messages
    // brings its "Locked chats" row back on this.
    if (!announced.current && next > 18) {
      announced.current = true;
      window.dispatchEvent(new Event(PULL_EVENT));
    }
    setPull(next);

    // Held at full stretch: start counting. Easing off cancels it, and the
    // count starts again from nothing if the pull comes back.
    if (holdTo && !held.current) {
      if (next >= HOLD_AT && !holdTimer.current) {
        setHolding(true);
        holdTimer.current = setTimeout(() => {
          holdTimer.current = null;
          held.current = true;
          setHolding(false);
          haptics.success();
          router.push(holdTo);
        }, VAULT_HOLD_MS);
      } else if (next < HOLD_AT && holdTimer.current) {
        stopHold();
      }
    }
  }

  function onTouchEnd() {
    if (startY.current === null) return;
    startY.current = null;
    stopHold();
    // The hold fired: this gesture was that, and is not also a refresh.
    if (held.current) {
      setPull(0);
      return;
    }
    if (pull >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPull(48); // hold the spinner visible
      const release = () => { setRefreshing(false); setPull(0); };
      if (onRefresh) {
        void reloadIfNewBuild();
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
          {holding ? (
            // A ring that fills over the length of the hold, round a lock:
            // the only time the Vault shows itself, and only to the thumb
            // that is already holding the list down.
            <span
              data-pull-hold
              className="pull-hold-ring flex h-8 w-8 items-center justify-center rounded-full"
              style={{ animationDuration: `${VAULT_HOLD_MS}ms` }}
            >
              <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-background text-accent">
                <Lock size={13} strokeWidth={2.6} />
              </span>
            </span>
          ) : (
            <HypefyMark
              spin={refreshing || armed}
              className={`h-7 w-7 transition-colors ${armed || refreshing ? "text-accent" : "text-faint"}`}
            />
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
