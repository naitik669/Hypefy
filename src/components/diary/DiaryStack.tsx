"use client";

import { useEffect, useRef, useState } from "react";
import { DiaryDisc } from "@/components/diary/DiaryDisc";
import { CARD_H, FriendDiaryCard } from "@/components/diary/FriendDiaryCard";
import { haptics } from "@/lib/haptics";
import { cardTilt, cycleDeck, type DiaryEntry } from "@/lib/diary";

/** How many cards are drawn: the top one and the two fanned out behind it. */
const VISIBLE = 3;
/** How far a drag has to go (px) to send the card away rather than back. */
const THROW_PX = 80;
/** How long the thrown card takes to leave before it is tucked in behind. */
const THROW_MS = 240;
/**
 * The deck sits in the middle of the screen, the same margin either side.
 * The top card's CD — big, the size of a real one in the hand — is tucked
 * behind the card's top-right corner and sticks out over it, into the space
 * above the deck, so a good part of the disc and its cover shows. It is
 * sized from the card (about half its height, 150px on a 314px card), so a
 * bigger card has a bigger disc and a smaller one a smaller disc.
 */
const INSET = 40;
const DISC = `calc(${CARD_H} * 0.48)`;
const PEEK = { right: `calc(${CARD_H} * -0.11)`, top: `calc(${CARD_H} * -0.2)` };
/**
 * Where each depth sits. The cards behind fan out like a hand of cards — the
 * first leaning left, the second leaning right — so their colours and
 * corners show on both sides of the one in front. How far each leans is the
 * card's own (cardTilt), so the fan is never quite the same twice.
 */
const DEPTH = [
  { x: 0, y: 0, scale: 1, side: 0, base: 0 },
  { x: -6, y: 12, scale: 0.97, side: -1, base: 3 },
  { x: 8, y: 22, scale: 0.94, side: 1, base: 3 },
];

/**
 * The spotlight: everyone's pages as a deck of cards, for going through
 * them one at a time.
 *
 * The top card is the whole Diary, readable and usable where it lies, and if
 * it has a song, its CD — tucked behind it on the right — starts playing and
 * turning by itself, and keeps going round until the card moves on. Swipe the
 * top card either way and it flies off, then tucks in at the back of the pile
 * as the next one comes up. No buttons for it: the swipe is the way, with the
 * arrow keys for a keyboard (← brings the last one back).
 */
export function DiaryStack({
  list,
  fresh,
  reacted,
  onReacted,
  hyped,
  onHyped,
  onOpen,
}: {
  list: DiaryEntry[];
  fresh: ReadonlySet<string>;
  reacted: Record<string, string>;
  onReacted: (userId: string, emoji: string | null) => void;
  /** The pages you have hyped, by owner. */
  hyped: ReadonlySet<string>;
  onHyped: (userId: string, hyped: boolean) => void;
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

  function next(dir: 1 | -1 = 1, from = 0) {
    if (deck.length < 2 || thrown) return;
    haptics.select();
    if (dir === -1) {
      setDeck((d) => cycleDeck(d, -1));
      return;
    }
    // Off to the side it was pushed, then tucked in at the back.
    setThrown({ id: deck[0], dir: from < 0 ? -1 : 1 });
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
    if (Math.abs(dx) > THROW_PX || (Math.abs(dx) > 30 && speed > 0.6)) next(1, dx);
    else setDrag(0);
  }

  if (!top) return null;
  const position = list.findIndex((e) => e.userId === deck[0]);

  // Drawn: the visible cards, one more waiting invisibly behind them (so it
  // can fade in as the pile moves up), and the last card in the deck — where
  // a thrown card lands, so it can be seen tucking in rather than vanishing.
  const drawn = deck.slice(0, VISIBLE + 1).map((id, depth) => ({ id, depth }));
  if (deck.length > VISIBLE + 1) drawn.push({ id: deck[deck.length - 1], depth: deck.length - 1 });

  return (
    <section aria-label="Pages from your circle" aria-roledescription="card stack">
      <div
        tabIndex={deck.length > 1 ? 0 : undefined}
        aria-keyshortcuts="ArrowLeft ArrowRight"
        className="relative rounded-[28px] outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        style={{ height: `calc(${CARD_H} + ${DEPTH[Math.min(VISIBLE, deck.length) - 1].y + 10}px)` }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") next(1);
          else if (e.key === "ArrowLeft") next(-1);
        }}
      >
        {/* Back to front, so the top card is painted last. */}
        {[...drawn].reverse().map(({ id, depth }) => {
          const entry = byId.get(id)!;
          const lean = cardTilt(id);
          const isTop = depth === 0;
          const hidden = depth >= VISIBLE;
          const at = DEPTH[Math.min(depth, VISIBLE - 1)];
          const isThrown = thrown?.id === id;

          let transform: string;
          if (isThrown) {
            transform = `translate(${thrown!.dir * 120}%, -14px) rotate(${thrown!.dir * 14}deg)`;
          } else if (isTop) {
            // The top card leans only a little, so it reads straight; it
            // follows your finger and tips the way you drag.
            transform = `translateX(${drag}px) rotate(${lean * 0.3 + drag / 24}deg)`;
          } else {
            const tilt = at.side * (at.base + Math.abs(lean) * 0.5);
            transform = `translate(${at.x}px, ${at.y}px) scale(${at.scale}) rotate(${tilt}deg)`;
          }

          return (
            <div
              key={id}
              className="absolute top-0 select-none"
              style={{
                left: INSET,
                right: INSET,
                transform,
                transformOrigin: "50% 60%",
                zIndex: isThrown ? 40 : 30 - Math.min(depth, 20),
                opacity: hidden ? 0 : 1,
                transition:
                  isTop && dragging
                    ? "none"
                    : "transform 420ms cubic-bezier(0.22, 0.9, 0.24, 1), opacity 320ms ease",
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
              {/* The top card's song: its CD, playing by itself, round and
                  round, until this card leaves the top. Keyed per card, so
                  each one's song starts as it arrives. */}
              {isTop && !isThrown && entry.track && (
                <DiaryDisc
                  key={id}
                  track={entry.track}
                  size={DISC}
                  slide={6}
                  lift={10}
                  autoPlay
                  className="absolute z-0"
                  style={{ right: PEEK.right, top: PEEK.top }}
                />
              )}
              <div className="relative z-10">
                <FriendDiaryCard
                  entry={entry}
                  fresh={fresh.has(id)}
                  mine={reacted[id] ?? null}
                  onReacted={onReacted}
                  hyped={hyped.has(id)}
                  onHyped={onHyped}
                  onOpen={() => onOpen(list.findIndex((e) => e.userId === id))}
                  inert={!isTop}
                  size="spotlight"
                />
              </div>
            </div>
          );
        })}
      </div>

      {deck.length > 1 && (
        <p className="mt-3 text-center text-xs font-semibold tabular-nums text-muted" aria-live="polite">
          <span className="text-foreground">{position + 1}</span>/{list.length}
        </p>
      )}
    </section>
  );
}
