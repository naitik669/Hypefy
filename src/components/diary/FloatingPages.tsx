"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { diaryTheme, fillSize } from "@/components/diary/DiaryPage";
import { loadSeen, storyOrder, unseen, type DiaryEntry } from "@/lib/diary";

/** Before the first shuffle, so the inbox is read before anything moves. */
export const FIRST_MS = 2500;
/** Between shuffles. */
export const EVERY_MS = 3600;
/** How long a card takes to slide off before it tucks in at the back. */
const OUT_MS = 300;
/** Still this long after a scroll, and the card comes back out. */
const SETTLE_MS = 700;
const MOVE = "transform 520ms cubic-bezier(0.22, 1, 0.36, 1), opacity 320ms ease";

/** How each card in the little deck stands, by how far back it is. */
function pose(depth: number): { transform: string; opacity: number } {
  if (depth === 0) return { transform: "rotate(-3deg)", opacity: 1 };
  if (depth === 1) return { transform: "translate(7px, 5px) rotate(4deg) scale(0.95)", opacity: 1 };
  return { transform: "translate(-7px, 8px) rotate(-7deg) scale(0.9)", opacity: depth === 2 ? 1 : 0 };
}
const OUT = { transform: "translate(-125%, -6px) rotate(-16deg)", opacity: 0 };

/** Reduce Motion, where the browser can say (older WebViews cannot). */
const motionQuery = () =>
  typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
const reducedMotion = {
  subscribe(fn: () => void) {
    const m = motionQuery();
    m?.addEventListener?.("change", fn);
    return () => m?.removeEventListener?.("change", fn);
  },
  get: () => motionQuery()?.matches ?? false,
  server: () => false,
};

/**
 * Spotlight, floating in Messages: a small tilted deck of your circle's
 * pages at the bottom right, where your thumb is. It shuffles by itself —
 * the top page slides off and tucks in at the back, the way Spotlight's deck
 * does when you swipe it — so you see whose page is up without opening
 * anything. Tap it and Spotlight opens on the page it was showing.
 *
 * Pages you have not opened come first, newest first (Spotlight's own
 * order). It goes round once and then rests on the first of them, so it is
 * not moving for as long as you are in Messages. It holds still while your
 * finger is on it and while the app is in the background, and while you
 * scroll it slips to the edge of the screen, out of the way of the chats,
 * coming back when you stop. With Reduce Motion it fades between pages
 * instead of sliding.
 *
 * With nobody else's page up it shows yours, or a "+" to write one, and does
 * not move: Spotlight is still one tap away.
 */
export function FloatingPages({
  pages,
  firstMs = FIRST_MS,
  everyMs = EVERY_MS,
}: {
  /** Today's pages as get_notes returns them, yours included. */
  pages: DiaryEntry[];
  /** For tests. */
  firstMs?: number;
  everyMs?: number;
}) {
  // What you have not opened lives on this device, so it is read after
  // mount; the server draws the newest first, and the order settles here.
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a one-time read of browser-only storage; see above
    setFresh(new Set(unseen(pages, loadSeen()).map((e) => e.userId)));
  }, [pages]);

  const others = useMemo(() => storyOrder(pages, fresh).slice(0, 8), [pages, fresh]);
  const mine = pages.find((e) => e.isSelf) ?? null;
  const n = others.length;
  const ids = others.map((e) => e.userId).join("|");

  // How many times it has shuffled. One round, then it rests.
  const [turn, setTurn] = useState(0);
  const [turnFor, setTurnFor] = useState(ids);
  if (turnFor !== ids) {
    setTurnFor(ids);
    setTurn(0);
  }
  const [leaving, setLeaving] = useState<string | null>(null);
  const [held, setHeld] = useState(false);
  const [tucked, setTucked] = useState(false);
  const [away, setAway] = useState(false);
  const reduce = useSyncExternalStore(reducedMotion.subscribe, reducedMotion.get, reducedMotion.server);

  const order = n ? [...others.slice(turn % n), ...others.slice(0, turn % n)] : [];
  const top = order[0] ?? null;

  // The next shuffle, unless it is held or has been round once.
  useEffect(() => {
    if (n < 2 || turn >= n || held || tucked || away) return;
    const t = window.setTimeout(
      () => {
        if (reduce) {
          setTurn((x) => x + 1);
          return;
        }
        setLeaving(order[0].userId);
        window.setTimeout(() => {
          setLeaving(null);
          setTurn((x) => x + 1);
        }, OUT_MS);
      },
      turn === 0 ? firstMs : everyMs
    );
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- order follows turn
  }, [n, turn, held, tucked, away, reduce, firstMs, everyMs]);

  // Out of the way while you scroll — any scroller on the page, hence capture.
  useEffect(() => {
    let settle = 0;
    const onScroll = () => {
      setTucked(true);
      window.clearTimeout(settle);
      settle = window.setTimeout(() => setTucked(false), SETTLE_MS);
    };
    const onVisible = () => setAway(document.visibilityState === "hidden");
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(settle);
      window.removeEventListener("scroll", onScroll, { capture: true });
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const newCount = others.filter((e) => fresh.has(e.userId)).length;
  const href = top ? `/messages/spotlight?page=${encodeURIComponent(top.userId)}` : "/messages/spotlight";
  const label = top
    ? `${top.name.split(" ")[0]}'s page: ${top.text}. Open Spotlight${newCount ? `, ${newCount} new` : ""}`
    : mine
      ? "Your page. Open Spotlight"
      : "Write your page in Spotlight";

  return (
    <Link
      href={href}
      aria-label={label}
      onPointerDown={() => setHeld(true)}
      onPointerUp={() => setHeld(false)}
      onPointerLeave={() => setHeld(false)}
      onPointerCancel={() => setHeld(false)}
      className="fixed bottom-[86px] z-20 block rounded-[18px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
      style={{
        right: "calc(max(0px, (100vw - 480px) / 2) + 14px)",
        width: top ? 104 : 64,
        height: top ? 132 : 84,
        // Slips to the edge while you scroll, a sliver still showing.
        transform: tucked ? `translateX(${top ? 78 : 44}px) scale(0.94)` : "none",
        transition: "transform 380ms cubic-bezier(0.22, 1, 0.36, 1)",
        filter: "drop-shadow(0 18px 22px rgb(0 0 0 / 0.7))",
      }}
    >
      {top ? (
        <>
          {/* The CD of the page on top, peeking out behind it. */}
          {top.track?.artwork && !leaving && (
            <span aria-hidden className="absolute -right-3 -top-3 h-9 w-9 rounded-full">
              <span
                className="diary-disc-spin relative flex h-full w-full items-center justify-center rounded-full"
                style={{ background: "radial-gradient(circle, #1e1e24 0%, #0c0c0f 72%, #16161b 100%)", boxShadow: "inset 0 0 0 1px rgb(255 255 255 / 0.12)" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={top.track.artwork} alt="" className="h-[48%] w-[48%] rounded-full object-cover" draggable={false} />
                <span className="absolute h-[3px] w-[3px] rounded-full bg-background" />
              </span>
            </span>
          )}
          {others.map((e) => {
            const depth = order.indexOf(e);
            const p = leaving === e.userId ? OUT : pose(depth);
            const theme = diaryTheme(e.color, e.hue);
            const isNew = fresh.has(e.userId);
            return (
              <span
                key={e.userId}
                aria-hidden
                className="absolute inset-0 flex flex-col overflow-hidden rounded-[16px] p-2 text-white"
                style={{
                  background: theme.background,
                  boxShadow: isNew ? `${theme.shadow}, inset 0 0 0 1.5px rgb(163 230 53 / 0.85)` : theme.shadow,
                  transform: reduce ? "none" : p.transform,
                  opacity: reduce ? (depth === 0 ? 1 : 0) : p.opacity,
                  zIndex: leaving === e.userId ? 11 : 10 - depth,
                  transition: reduce ? "opacity 400ms ease" : MOVE,
                }}
              >
                <span className="flex min-w-0 items-center gap-1">
                  <Avatar name={e.name} hue={e.hue} size={18} src={e.avatarUrl ?? undefined} className="rounded-md" />
                  <span className="truncate text-[10px] font-bold">{e.name.split(" ")[0]}</span>
                  {isNew && <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-accent" />}
                </span>
                <span
                  className="mt-auto break-words font-extrabold leading-[1.04] tracking-[-0.02em]"
                  style={{
                    // Sized for the ~72px inside the card's padding.
                    fontSize: Math.min(32, fillSize(e.text, 70)),
                    display: "-webkit-box",
                    WebkitLineClamp: 4,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {e.text}
                </span>
                <span aria-hidden className="absolute bottom-0 left-0 h-[2px] w-full opacity-80" style={{ background: theme.burn }} />
              </span>
            );
          })}
          {newCount > 0 && (
            <span className="absolute -left-2 -top-2 z-20 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-black text-accent-ink ring-[3px] ring-background">
              {newCount}
            </span>
          )}
        </>
      ) : mine ? (
        // Nobody else's page is up: yours, still.
        <span
          className="absolute inset-0 flex flex-col overflow-hidden rounded-[14px] p-1.5 text-white"
          style={{ background: diaryTheme(mine.color, mine.hue).background, transform: "rotate(-3deg)" }}
        >
          <span className="text-[9px] font-bold text-white/70">You</span>
          <span className="mt-auto line-clamp-3 break-words text-[11px] font-extrabold leading-tight">{mine.text}</span>
        </span>
      ) : (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-[14px] border-[1.5px] border-dashed border-white/25 bg-background/80 text-[10px] font-bold text-muted backdrop-blur-md">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-elevated text-foreground">
            <Plus size={15} strokeWidth={2.6} />
          </span>
          Page
        </span>
      )}
    </Link>
  );
}
