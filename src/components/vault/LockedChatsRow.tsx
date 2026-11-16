"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight, Lock } from "lucide-react";
import { LOCKED_ROW_LINGER_MS } from "@/lib/chat-vault";
import { PULL_EVENT } from "@/components/ui/PullToRefresh";

/**
 * The way into locked chats: a row at the top of Messages that does not
 * stay.
 *
 * It pops in when Messages opens, and goes away at the first scroll or touch
 * of the list, or after a few seconds of neither. Pulling the list down
 * brings it back. It says how many chats are behind it and whether anything
 * there is unread, and never who.
 */
export function LockedChatsRow({ count, unread }: { count: number; unread: boolean }) {
  const [shown, setShown] = useState(true);
  const row = useRef<HTMLAnchorElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function linger() {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setShown(false), LOCKED_ROW_LINGER_MS);
    }
    function hide(e: Event) {
      // Touching the row itself is using it, not dismissing it.
      if (e.target instanceof Node && row.current?.contains(e.target)) return;
      setShown(false);
    }
    /**
     * Scrolling away hides it; coming back to the top brings it back, but
     * only where there is a pointer.
     *
     * On a phone the way to bring it back is to pull the list down, and a
     * pull is not something a mouse does — so once the row had lingered out
     * on a desktop the only way back was to leave Messages and return. The
     * analogue of "pull the list down" for a pointer is "scroll back to the
     * very top", which is the same movement without the overscroll, and
     * Home does it from the keyboard.
     *
     * Gated on a fine pointer so touch behaviour is exactly as it was: there
     * the pull already does this, and re-showing at scrollTop 0 as well
     * would make the row flicker in during the pull itself.
     *
     * `returned` is what keeps it from re-showing on every small scroll near
     * the top: it has to have been genuinely scrolled away first.
     */
    let returned = false;
    const finePointer =
      typeof window !== "undefined" &&
      window.matchMedia?.("(pointer: fine)").matches === true;

    function onScroll() {
      if (window.scrollY > 8) {
        setShown(false);
        returned = true;
        return;
      }
      if (finePointer && returned) {
        returned = false;
        setShown(true);
        linger();
      }
    }
    function onPull() {
      setShown(true);
      linger();
    }

    linger();
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("pointerdown", hide, { passive: true });
    window.addEventListener(PULL_EVENT, onPull);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("pointerdown", hide);
      window.removeEventListener(PULL_EVENT, onPull);
    };
  }, []);

  return (
    // Collapses to nothing rather than being removed, so it can slide.
    <div
      data-locked-row={shown ? "shown" : "hidden"}
      aria-hidden={!shown}
      className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
        shown ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      }`}
    >
      <div className="overflow-hidden">
        <Link
          ref={row}
          href="/messages/locked"
          tabIndex={shown ? 0 : -1}
          className="mx-3 mb-1 mt-2 flex items-center gap-3 rounded-2xl border border-border bg-surface px-3.5 py-3 transition-transform active:scale-[0.99]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[30%] bg-elevated text-accent">
            <Lock size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Locked chats</span>
            <span className="block text-xs text-muted">
              {count} {count === 1 ? "chat" : "chats"}
            </span>
          </span>
          {unread && <span aria-label="Unread messages" className="h-2 w-2 shrink-0 rounded-full bg-accent" />}
          <ChevronRight size={16} className="shrink-0 text-faint" />
        </Link>
      </div>
    </div>
  );
}
