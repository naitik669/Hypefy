"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { diaryTheme, fillSize } from "@/components/diary/DiaryPage";
import { cycleDeck, loadSeen, storyOrder, unseen, type DiaryEntry } from "@/lib/diary";

/** How much of the card shows at the right edge while it is peeking. */
export const PEEK_PX = 30;
/** Scroll this far down the inbox and the card is all the way out. */
export const REVEAL_PX = 140;
/** Within this of the top counts as the top — browsers restore a pixel or two. */
const TOP_PX = 8;
/** As Messages opens, how long it stays out before tucking back to the edge. */
export const INTRO_HOLD_MS = 1600;
/** A drag this far, or a quick flick, sends the top page to the back. */
const THROW_PX = 40;
const THROW_MS = 300;
const MOVE = "transform 480ms cubic-bezier(0.22, 1, 0.36, 1), opacity 300ms ease";
const SLIDE = "transform 420ms cubic-bezier(0.22, 1, 0.36, 1)";
/** Its entrance: in from past the edge, with a little overshoot. */
const ENTER = "transform 620ms cubic-bezier(0.34, 1.25, 0.5, 1), opacity 260ms ease";

/** How each card in the little deck stands, by how far back it is. */
function pose(depth: number): { transform: string; opacity: number } {
  if (depth === 0) return { transform: "rotate(-3deg)", opacity: 1 };
  if (depth === 1) return { transform: "translate(7px, 5px) rotate(4deg) scale(0.95)", opacity: 1 };
  return { transform: "translate(-7px, 8px) rotate(-7deg) scale(0.9)", opacity: depth === 2 ? 1 : 0 };
}
const thrownPose = (dir: 1 | -1) => ({ transform: `translate(${dir * 130}%, -6px) rotate(${dir * 16}deg)`, opacity: 0 });

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
 * Spotlight, in Messages: a small tilted deck of your circle's pages at the
 * bottom right, where your thumb is.
 *
 * As Messages opens it slides in from the right, stays a moment so you see
 * it, and goes back to wait at the edge — a sliver of the top page and its
 * count peeking out. Scroll down and it slides in with you, all the way out
 * by the time you have scrolled a little. Tap the sliver and it comes out
 * without scrolling. Scroll or touch it during its entrance and it stops
 * there and follows you instead; with Reduce Motion it simply waits at the
 * edge. Otherwise it moves only when you move it. Once out, swipe
 * it either way to send the top page to the back and bring the next up — the
 * same throw as Spotlight's deck — and tap it to open Spotlight on the page
 * on top, the rest following in the same order. Back at the top of the
 * inbox, it tucks away again.
 *
 * Pages you have not opened come first, newest first (Spotlight's own
 * order), with their count on the card's corner and a lime edge. With nobody
 * else's page up it shows yours, or a "+" to write one: Spotlight is always
 * one tap away.
 */
export function FloatingPages({
  pages,
  introHoldMs = INTRO_HOLD_MS,
}: {
  pages: DiaryEntry[];
  /** For tests. */
  introHoldMs?: number;
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
  const ids = others.map((e) => e.userId).join("|");

  // The deck: an order of ids over `others`, starting again when they change.
  const [deck, setDeck] = useState(() => others.map((e) => e.userId));
  const [deckFor, setDeckFor] = useState(ids);
  if (deckFor !== ids) {
    setDeckFor(ids);
    setDeck(others.map((e) => e.userId));
  }
  const [thrown, setThrown] = useState<{ id: string; dir: 1 | -1 } | null>(null);
  const reduce = useSyncExternalStore(reducedMotion.subscribe, reducedMotion.get, reducedMotion.server);

  const byId = new Map(others.map((e) => [e.userId, e]));
  // A thrown card already counts as the back one, so the next comes up as it leaves.
  const order = thrown ? [...deck.filter((id) => id !== thrown.id), thrown.id] : deck;
  const top = byId.get(order[0]) ?? null;

  const link = useRef<HTMLAnchorElement>(null);
  const cards = useRef(new Map<string, HTMLSpanElement>());
  const press = useRef<{ x: number; y: number; t: number; axis: "x" | "y" | null } | null>(null);
  const swiped = useRef(false);
  const out = useRef(false);
  /** Brought out by a tap at the top of the inbox, where scrolling would not. */
  const pinned = useRef(false);
  const lastY = useRef(0);
  const throwTimer = useRef<number | undefined>(undefined);
  /** Its entrance is under way (out, about to go back to the edge). */
  const entering = useRef(false);
  const entered = useRef(false);
  const enterTimer = useRef<number | undefined>(undefined);
  const width = top ? 104 : 64;
  // Where it starts: just past the right edge, unseen, for its entrance. The
  // effect below takes over from here; these never change, so React does not
  // fight the transform and opacity set there.
  const [resting] = useState(() => ({ transform: `translateX(${width + 20}px)`, opacity: 0 }));

  /** The entrance is over: stop, and stay wherever it is. */
  function endEntrance() {
    entering.current = false;
    window.clearTimeout(enterTimer.current);
  }

  /** Slide it: 0 is peeking at the edge, 1 all the way out. */
  function place(p: number, transition: string) {
    const el = link.current;
    if (!el) return;
    out.current = p >= 1;
    el.style.transition = transition;
    el.style.transform = p >= 1 ? "none" : `translateX(${(1 - p) * (width - PEEK_PX)}px)`;
  }

  // Out as you scroll down, back at the edge at the top. Read each frame at
  // most, straight to the transform: a scroll must never re-render the inbox.
  useEffect(() => {
    let frame = 0;
    const read = (animate: boolean) => {
      const y = window.scrollY <= TOP_PX ? 0 : window.scrollY;
      if (y === 0 && lastY.current > 0) pinned.current = false; // back at the top: tuck away
      lastY.current = y;
      const p = pinned.current ? 1 : Math.min(1, y / REVEAL_PX);
      place(p, animate ? SLIDE : "transform 90ms linear");
    };
    const onScroll = () => {
      // A real scroll during the entrance ends it; from here the scroll
      // decides. (Not the pixel a browser restores as the page loads.)
      if (entering.current) {
        if (window.scrollY <= TOP_PX) return;
        endEntrance();
      }
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        read(false);
      });
    };
    const el = link.current;
    const still = motionQuery()?.matches ?? false;
    if (el && !entered.current && top && window.scrollY <= TOP_PX && !still) {
      // Messages has just opened, at the top: in from the right, a moment
      // out, then back to wait at the edge. The read of offsetWidth makes
      // sure its start, past the edge, is laid out before it moves, so it
      // slides in even when Messages was reached without a full load.
      entered.current = true;
      entering.current = true;
      lastY.current = 0;
      void el.offsetWidth;
      place(1, ENTER);
      el.style.opacity = "1";
      enterTimer.current = window.setTimeout(() => {
        entering.current = false;
        if (!pinned.current && window.scrollY <= TOP_PX) place(0, SLIDE);
      }, introHoldMs);
    } else {
      entered.current = true;
      read(false);
      if (el) el.style.opacity = "1";
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
      window.clearTimeout(enterTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- width only changes with top, which place reads fresh
  }, [width]);

  useEffect(() => () => window.clearTimeout(throwTimer.current), []);

  /** Move a card's inner layer — straight to the DOM, no re-render. */
  function drag(dx: number, transition = "none", id = top?.userId) {
    const el = id ? cards.current.get(id) : undefined;
    if (!el) return;
    el.style.transition = transition;
    el.style.transform = dx ? `translate(${dx}px, 0) rotate(${dx / 16}deg)` : "";
  }

  /** The top page to the back (the way it was thrown), or the back one to the top. */
  function flick(dir: 1 | -1, back = false) {
    if (order.length < 2 || thrown) return;
    if (back) {
      setDeck((d) => cycleDeck(d, -1));
      return;
    }
    // It flies on from wherever the finger left it, then drops the drag once
    // it is out of sight, ready for its place at the back.
    const id = order[0];
    setThrown({ id, dir });
    throwTimer.current = window.setTimeout(() => {
      drag(0, "none", id);
      setDeck((d) => cycleDeck(d, 1));
      setThrown(null);
    }, reduce ? 0 : THROW_MS);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // Caught during its entrance: it stays out for you.
    if (entering.current) {
      endEntrance();
      pinned.current = true;
    }
    swiped.current = false;
    press.current = out.current && order.length > 1 ? { x: e.clientX, y: e.clientY, t: e.timeStamp, axis: null } : null;
  }
  function onPointerMove(e: React.PointerEvent) {
    const p = press.current;
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (!p.axis) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      p.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (p.axis === "x") {
        swiped.current = true;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* still follows while the finger stays on the card */
        }
      }
    }
    if (p.axis === "x") drag(dx);
  }
  function onPointerUp(e: React.PointerEvent) {
    const p = press.current;
    press.current = null;
    if (!p || p.axis !== "x") return;
    const dx = e.clientX - p.x;
    const quick = Math.abs(dx) > 24 && Math.abs(dx) / Math.max(1, e.timeStamp - p.t) > 0.5;
    if (Math.abs(dx) > THROW_PX || quick) flick(dx < 0 ? -1 : 1);
    else drag(0, "transform 460ms cubic-bezier(0.34, 1.4, 0.64, 1)"); // springs back
  }

  const newCount = others.filter((e) => fresh.has(e.userId)).length;
  const href = top ? `/messages/spotlight?page=${encodeURIComponent(top.userId)}` : "/messages/spotlight";
  const label = top
    ? `${top.name.split(" ")[0]}'s page: ${top.text}. Open Spotlight${newCount ? `, ${newCount} new` : ""}${order.length > 1 ? ". Swipe for the next page" : ""}`
    : mine
      ? "Your page. Open Spotlight"
      : "Write your page in Spotlight";

  return (
    <Link
      ref={link}
      href={href}
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        press.current = null;
        drag(0, "transform 300ms ease");
      }}
      onClick={(e) => {
        // A swipe is not a tap; and a tap on the sliver brings it out first.
        if (swiped.current) {
          e.preventDefault();
          swiped.current = false;
        } else if (!out.current) {
          e.preventDefault();
          pinned.current = true;
          place(1, SLIDE);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") flick(1);
        if (e.key === "ArrowLeft") flick(-1, true);
      }}
      onFocus={(e) => {
        // Tabbed to: all the way out, so what is focused can be seen. Only
        // for the keyboard — a tap focuses it too, and that tap is the one
        // that should bring it out, not go straight through to Spotlight.
        if (!e.currentTarget.matches(":focus-visible")) return;
        pinned.current = true;
        place(1, SLIDE);
      }}
      onDragStart={(e) => e.preventDefault()}
      className="fixed bottom-[86px] z-20 block select-none rounded-[18px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
      style={{
        right: "calc(max(0px, (100vw - 480px) / 2) + 14px)",
        width,
        height: top ? 132 : 84,
        transform: resting.transform,
        opacity: resting.opacity,
        // Up and down still scroll the inbox from the card; sideways is the deck's.
        touchAction: "pan-y",
        WebkitTouchCallout: "none",
        filter: "drop-shadow(0 18px 22px rgb(0 0 0 / 0.7))",
      }}
    >
      {top ? (
        <>
          {/* The CD of the page on top, peeking out behind it. */}
          {top.track?.artwork && !thrown && (
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
            const depth = order.indexOf(e.userId);
            const isThrown = thrown?.id === e.userId;
            const p = isThrown ? thrownPose(thrown.dir) : pose(depth);
            const theme = diaryTheme(e.color, e.hue);
            const isNew = fresh.has(e.userId);
            return (
              <span
                key={e.userId}
                aria-hidden
                className="absolute inset-0"
                style={{
                  transform: reduce ? "none" : p.transform,
                  opacity: reduce ? (depth === 0 && !isThrown ? 1 : 0) : p.opacity,
                  zIndex: isThrown ? 11 : 10 - depth,
                  transition: reduce ? "opacity 300ms ease" : MOVE,
                }}
              >
                {/* The inner layer is what a finger drags. */}
                <span
                  ref={(el) => {
                    if (el) cards.current.set(e.userId, el);
                    else cards.current.delete(e.userId);
                  }}
                  className="absolute inset-0 flex flex-col overflow-hidden rounded-[16px] p-2 text-white"
                  style={{
                    background: theme.background,
                    boxShadow: isNew ? `${theme.shadow}, inset 0 0 0 1.5px rgb(163 230 53 / 0.85)` : theme.shadow,
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
