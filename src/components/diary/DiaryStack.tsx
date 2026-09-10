"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DiaryDisc } from "@/components/diary/DiaryDisc";
import { CARD_HEIGHT, FriendDiaryCard } from "@/components/diary/FriendDiaryCard";
import { haptics } from "@/lib/haptics";
import { pausePreview } from "@/lib/music";
import { cardTilt, cycleDeck, type DiaryEntry } from "@/lib/diary";

/** How many cards are drawn: the top one and the two peeking behind it. */
const VISIBLE = 3;
/** How far a drag has to go (px) to send the card away rather than back. */
const THROW_PX = 80;
/** How long the thrown card takes to leave before it is tucked in behind. */
const THROW_MS = 230;
/**
 * Where each depth sits. The cards behind fan out — the first leaning left
 * and nudged left, the second leaning right — so their colours and corners
 * show on both sides of the one in front. How far each leans is the card's
 * own (cardTilt), so the fan is never quite the same twice.
 */
const DEPTH = [
  { x: 0, y: 0, scale: 1, side: 0, base: 0 },
  { x: -14, y: 12, scale: 0.96, side: -1, base: 3 },
  { x: 14, y: 24, scale: 0.92, side: 1, base: 2.5 },
];

/**
 * Everyone's Diaries as a stack of cards, each leaning its own way.
 *
 * The top card is the whole Diary, readable and usable where it lies. Swipe
 * it either way and it goes to the back of the pile and the next comes up;
 * the arrows underneath do the same, and ‹ brings the last one back, for a
 * card swiped by mistake. The cards behind show their colour and a sliver of
 * their words — enough to see who else is waiting.
 *
 * The song is a CD tucked behind the top card, peeking out on the right.
 */
export function DiaryStack({
  list,
  fresh,
  reacted,
  onReacted,
  onOpen,
}: {
  list: DiaryEntry[];
  fresh: ReadonlySet<string>;
  reacted: Record<string, string>;
  onReacted: (userId: string, emoji: string | null) => void;
  /** Open full-screen at this Diary (its index in `list`). */
  onOpen: (index: number) => void;
}) {
  // The deck is an order of ids over `list`; it starts as `list`'s order and
  // starts again whenever the set of Diaries changes.
  const ids = list.map((e) => e.userId).join("|");
  const [deck, setDeck] = useState(() => list.map((e) => e.userId));
  const [deckFor, setDeckFor] = useState(ids);
  if (deckFor !== ids) {
    setDeckFor(ids);
    setDeck(list.map((e) => e.userId));
  }

  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [thrown, setThrown] = useState<{ id: string; dir: 1 | -1 } | null>(null);
  const press = useRef<{ x: number; y: number; t: number; axis: "x" | "y" | null } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  /** Set when a press turned into a swipe, so it does not also count as a tap. */
  const swiped = useRef(false);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const byId = new Map(list.map((e) => [e.userId, e]));
  const top = byId.get(deck[0]);

  function next(dir: 1 | -1 = 1) {
    if (deck.length < 2 || thrown) return;
    haptics.select();
    // The song belongs to the card leaving the top; it stops with it.
    pausePreview();
    if (dir === -1) {
      setDeck((d) => cycleDeck(d, -1));
      return;
    }
    // Out to the side first, then tucked in at the back.
    setThrown({ id: deck[0], dir: drag < 0 ? -1 : 1 });
    setDrag(0);
    timer.current = window.setTimeout(() => {
      setDeck((d) => cycleDeck(d, 1));
      setThrown(null);
    }, THROW_MS);
  }

  function onPointerDown(e: React.PointerEvent) {
    // Buttons, links and the reply popup (a portal, so outside this element)
    // are taps, not the start of a swipe.
    const t = e.target as HTMLElement;
    if (!e.currentTarget.contains(t) || t.closest("button, a, input, textarea")) return;
    if (deck.length < 2) return;
    press.current = { x: e.clientX, y: e.clientY, t: performance.now(), axis: null };
    swiped.current = false;
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
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setDragging(true);
      }
    }
    if (p.axis === "x") setDrag(dx);
  }
  function onPointerUp(e: React.PointerEvent) {
    const p = press.current;
    press.current = null;
    if (!p || p.axis !== "x") return;
    setDragging(false);
    const dx = e.clientX - p.x;
    const speed = Math.abs(dx) / Math.max(1, performance.now() - p.t);
    if (Math.abs(dx) > THROW_PX || (Math.abs(dx) > 30 && speed > 0.6)) next(1);
    else setDrag(0);
  }

  if (!top) return null;
  const position = list.findIndex((e) => e.userId === deck[0]);

  return (
    <section aria-label="Diaries from your circle" aria-roledescription="card stack">
      <div
        className="relative mx-auto"
        style={{ height: CARD_HEIGHT + DEPTH[Math.min(VISIBLE, deck.length) - 1].y + 8 }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") next(1);
          else if (e.key === "ArrowLeft") next(-1);
        }}
      >
        {/* Back to front, so the top card is painted last. */}
        {deck
          .slice(0, VISIBLE + 1)
          .map((id, depth) => ({ id, depth }))
          .reverse()
          .map(({ id, depth }) => {
            const entry = byId.get(id)!;
            const lean = cardTilt(id);
            const isTop = depth === 0;
            const hidden = depth >= VISIBLE;
            const at = DEPTH[Math.min(depth, VISIBLE - 1)];
            const isThrown = thrown?.id === id;

            let transform: string;
            if (isThrown) {
              transform = `translate(${thrown!.dir * 125}%, -12px) rotate(${thrown!.dir * 16}deg)`;
            } else if (isTop) {
              // The top card leans only a little, so it reads straight; it
              // follows your finger and tips the way you drag.
              transform = `translateX(${drag}px) rotate(${lean * 0.35 + drag / 22}deg)`;
            } else {
              const tilt = at.side * (at.base + Math.abs(lean) * 0.7);
              transform = `translate(${at.x}px, ${at.y}px) scale(${at.scale}) rotate(${tilt}deg)`;
            }

            return (
              <div
                key={id}
                className="absolute inset-x-7 top-0 select-none"
                style={{
                  transform,
                  transformOrigin: "50% 85%",
                  zIndex: isThrown ? 40 : 30 - depth,
                  opacity: hidden ? 0 : 1,
                  transition: isTop && dragging ? "none" : "transform 380ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 260ms",
                  touchAction: isTop ? "pan-y" : undefined,
                  pointerEvents: isTop && !thrown ? "auto" : "none",
                }}
                onClickCapture={(e) => {
                  if (swiped.current) {
                    swiped.current = false;
                    e.stopPropagation();
                    e.preventDefault();
                  }
                }}
                onPointerDown={isTop ? onPointerDown : undefined}
                onPointerMove={isTop ? onPointerMove : undefined}
                onPointerUp={isTop ? onPointerUp : undefined}
                onPointerCancel={
                  isTop
                    ? () => {
                        press.current = null;
                        setDragging(false);
                        setDrag(0);
                      }
                    : undefined
                }
              >
                {isTop && entry.track && (
                  <DiaryDisc
                    track={entry.track}
                    size={104}
                    slide={10}
                    className="absolute -right-6 top-1/2 z-0"
                    style={{ marginTop: -52 - 8 }}
                  />
                )}
                <div className="relative z-10">
                  <FriendDiaryCard
                    entry={entry}
                    fresh={fresh.has(id)}
                    mine={reacted[id] ?? null}
                    onReacted={onReacted}
                    onOpen={() => onOpen(list.findIndex((e) => e.userId === id))}
                    inert={!isTop}
                  />
                </div>
              </div>
            );
          })}
      </div>

      {deck.length > 1 && (
        <div className="mt-3 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => next(-1)}
            aria-label="Previous Diary"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.07] text-white/75 transition-colors hover:bg-white/[0.12] hover:text-white"
          >
            <ChevronLeft size={18} />
          </button>
          <p className="min-w-[128px] text-center text-xs text-muted" aria-live="polite">
            <span className="font-semibold tabular-nums text-foreground">
              {position + 1} of {list.length}
            </span>{" "}
            · swipe for the next
          </p>
          <button
            type="button"
            onClick={() => next(1)}
            aria-label="Next Diary"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.07] text-white/75 transition-colors hover:bg-white/[0.12] hover:text-white"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}
    </section>
  );
}
