"use client";

import { useEffect, useRef, useState } from "react";
import { DiaryDisc } from "@/components/diary/DiaryDisc";
import { CARD_H, FriendDiaryCard } from "@/components/diary/FriendDiaryCard";
import { haptics } from "@/lib/haptics";
import { useIsPlaying } from "@/lib/music";
import { cardTilt, cycleDeck, type DiaryEntry } from "@/lib/diary";

/** How many cards are drawn: the top one and the two fanned out behind it. */
const VISIBLE = 3;
/** How far a drag has to go (px) to send the card away rather than back. */
const THROW_PX = 80;
/** How far a drag goes for the card behind to have fully come forward. */
const FULL_PX = 170;
/** How long the thrown card flies before it is tucked in at the back. */
const THROW_MS = 300;
/** Everything that settles — the deck moving up, a card snapping back. */
const SETTLE = "480ms cubic-bezier(0.22, 1, 0.36, 1)";
/** A thrown card leaving: fast away, no settling. */
const FLY = "420ms cubic-bezier(0.3, 0.6, 0.35, 1)";

/**
 * The deck sits in the middle of the screen, the same margin either side.
 * A page's CD — big, about half the card's height — is tucked behind its
 * right edge, a sliver showing, on the cards behind as on the one in front. When the song plays the card nudges left
 * and the disc slides out to the right, far enough to show its cover.
 */
const INSET = 40;
const DISC = `calc(${CARD_H} * 0.48)`;
const DISC_AT = { right: `calc(${CARD_H} * -0.1)`, marginTop: `calc(${CARD_H} * -0.24)` };
const PLAYING_NUDGE = 30;
const PLAYING_SLIDE = 46;

type Pose = { x: number; y: number; scale: number; rot: number };

/**
 * Where a card sits at each depth. The cards behind fan out like a hand of
 * cards — the first leaning left, the second leaning right — so their colours
 * and corners show on both sides of the one in front. How far each leans is
 * the card's own (cardTilt), so the fan is never quite the same twice.
 */
function pose(depth: number, lean: number): Pose {
  if (depth <= 0) return { x: 0, y: 0, scale: 1, rot: lean * 0.3 };
  if (depth === 1) return { x: -6, y: 12, scale: 0.97, rot: -(3 + Math.abs(lean) * 0.5) };
  return { x: 8, y: 22, scale: 0.94, rot: 3 + Math.abs(lean) * 0.5 };
}
const css = (p: Pose, dx = 0) => `translate(${p.x + dx}px, ${p.y}px) scale(${p.scale}) rotate(${p.rot}deg)`;

/**
 * The spotlight: everyone's pages as a deck of cards, for going through
 * them one at a time.
 *
 * The top card is the whole page, readable and usable where it lies, and if
 * it has a song its CD starts playing and turning by itself, round and round
 * until the card moves on.
 *
 * Swiping is drawn frame by frame, off React: the card follows your finger
 * and tips the way you drag, and the cards behind come forward with it — the
 * next one growing and straightening towards the front in step with how far
 * you have gone. Let go past the line and the card flies off the way it was
 * going while everything behind settles into its new place in one motion; let
 * go short of it and it all springs back. A thrown card then tucks in at the
 * back of the pile. The arrow keys do the same for a keyboard.
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
  /** Open full-screen at this page (its index in `list`). */
  onOpen: (index: number) => void;
}) {
  // The deck is an order of ids over `list`; it starts as `list`'s order and
  // starts again whenever the set of pages changes.
  const ids = list.map((e) => e.userId).join("|");
  const [deck, setDeck] = useState(() => list.map((e) => e.userId));
  const [deckFor, setDeckFor] = useState(ids);
  if (deckFor !== ids) {
    setDeckFor(ids);
    setDeck(list.map((e) => e.userId));
  }

  const [thrown, setThrown] = useState<{ id: string; dir: 1 | -1 } | null>(null);
  const press = useRef<{ x: number; y: number; t: number; axis: "x" | "y" | null } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const frame = useRef<number | undefined>(undefined);
  const lastDx = useRef(0);
  /** Set when a press turned into a swipe, so it does not also count as a tap. */
  const swiped = useRef(false);
  /**
   * The inner layer of each card, moved by hand while you drag. React places
   * the outer layer (each card's resting pose, with a transition); the drag
   * is added on top here, so a finger's movement never re-renders the deck.
   */
  const inner = useRef(new Map<string, HTMLDivElement>());
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      if (frame.current) cancelAnimationFrame(frame.current);
    },
    []
  );

  const byId = new Map(list.map((e) => [e.userId, e]));

  // The order the cards stand in. While a card is being thrown it already
  // counts as the back one, so everything behind it moves up the moment it
  // leaves rather than after — and the next page's song starts right away.
  const order = thrown ? [...deck.filter((id) => id !== thrown.id), thrown.id] : deck;
  const topId = order[0];
  const top = byId.get(topId);
  const playing = useIsPlaying(top?.track?.id);

  /** Lay a transform on a card's inner layer, now or with a transition. */
  function setInner(id: string | undefined, transform: string, transition = "none") {
    const el = id ? inner.current.get(id) : undefined;
    if (!el) return;
    el.style.transition = transition;
    el.style.transform = transform;
  }

  /**
   * The top card's CD, faded by hand during a drag: it belongs to the card,
   * and pulled away with it would sit on top of the card behind.
   */
  function discOf(id: string | undefined) {
    return (id ? inner.current.get(id) : undefined)?.querySelector<HTMLElement>("[data-disc]") ?? null;
  }

  /** One drag frame: the top card under the finger, the ones behind following. */
  function paint(dx: number) {
    setInner(topId, `translateX(${dx}px) rotate(${dx / 24}deg)`);
    const p = Math.min(1, Math.abs(dx) / FULL_PX);
    const disc = discOf(topId);
    if (disc) {
      disc.style.transition = "opacity 120ms linear";
      disc.style.opacity = String(Math.max(0, 1 - p * 2.5));
    }
    for (let d = 1; d < Math.min(VISIBLE, order.length); d++) {
      const lean = cardTilt(order[d]);
      const from = pose(d, lean);
      const to = pose(d - 1, lean);
      setInner(
        order[d],
        `translate(${(to.x - from.x) * p}px, ${(to.y - from.y) * p}px) scale(${1 + (to.scale / from.scale - 1) * p}) rotate(${(to.rot - from.rot) * p}deg)`
      );
    }
  }

  /** Every card's drag layer back to nothing, with the given motion. */
  function release(transition: string, except?: string) {
    for (const id of order.slice(0, VISIBLE)) if (id !== except) setInner(id, "", transition);
    const disc = discOf(topId);
    if (disc && topId !== except) {
      disc.style.transition = "opacity 300ms ease";
      disc.style.opacity = "";
    }
  }

  function next(dir: 1 | -1 = 1, from = 0) {
    if (order.length < 2 || thrown) return;
    haptics.select();
    if (dir === -1) {
      release(`transform ${SETTLE}`);
      setDeck((d) => cycleDeck(d, -1));
      return;
    }
    const id = order[0];
    // The cards behind settle from wherever the drag had brought them; the
    // thrown one keeps its drag offset and flies on from there.
    release(`transform ${SETTLE}`, id);
    setThrown({ id, dir: from < 0 ? -1 : 1 });
    timer.current = window.setTimeout(() => {
      setInner(id, ""); // it is off-screen now; drop the drag without a trace
      const disc = discOf(id); // and its CD, faded by the drag, back for the pile
      if (disc) {
        disc.style.transition = "opacity 300ms ease";
        disc.style.opacity = "";
      }
      setDeck((d) => cycleDeck(d, 1));
      setThrown(null);
    }, THROW_MS);
  }

  function onPointerDown(e: React.PointerEvent) {
    // Buttons, links and the reply popup (a portal, so outside this element)
    // are taps, not the start of a swipe.
    const t = e.target as HTMLElement;
    if (!e.currentTarget.contains(t) || t.closest("button, a, input, textarea")) return;
    if (order.length < 2 || thrown) return;
    press.current = { x: e.clientX, y: e.clientY, t: e.timeStamp, axis: null };
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
      }
    }
    if (p.axis !== "x") return;
    lastDx.current = dx;
    // At most one paint per frame, however fast the events come.
    if (!frame.current) {
      frame.current = requestAnimationFrame(() => {
        frame.current = undefined;
        paint(lastDx.current);
      });
    }
  }
  function onPointerUp(e: React.PointerEvent) {
    const p = press.current;
    press.current = null;
    if (frame.current) {
      cancelAnimationFrame(frame.current);
      frame.current = undefined;
    }
    if (!p || p.axis !== "x") return;
    const dx = e.clientX - p.x;
    const speed = Math.abs(dx) / Math.max(1, e.timeStamp - p.t);
    paint(dx);
    if (Math.abs(dx) > THROW_PX || (Math.abs(dx) > 30 && speed > 0.6)) next(1, dx);
    else release(`transform 520ms cubic-bezier(0.34, 1.4, 0.64, 1)`); // a little spring on the way back
  }
  function onPointerCancel() {
    press.current = null;
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = undefined;
    release(`transform ${SETTLE}`);
  }

  if (!top) return null;
  const position = list.findIndex((e) => e.userId === topId);

  // Drawn: the visible cards, one more waiting invisibly behind them (so it
  // can fade in as the pile moves up), and the last card — where a thrown
  // card lands, so it can be seen tucking in rather than vanishing.
  const drawn = order.slice(0, VISIBLE + 1).map((id, depth) => ({ id, depth }));
  if (order.length > VISIBLE + 1) drawn.push({ id: order[order.length - 1], depth: order.length - 1 });

  return (
    <section aria-label="Pages from your circle" aria-roledescription="card stack">
      <div
        tabIndex={order.length > 1 ? 0 : undefined}
        aria-keyshortcuts="ArrowLeft ArrowRight"
        className="relative rounded-[28px] outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        style={{ height: `calc(${CARD_H} + ${pose(Math.min(VISIBLE, order.length) - 1, 0).y + 10}px)` }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") next(1);
          else if (e.key === "ArrowLeft") next(-1);
        }}
      >
        {/* Back to front, so the top card is painted last. */}
        {[...drawn].reverse().map(({ id, depth }) => {
          const entry = byId.get(id)!;
          const lean = cardTilt(id);
          const isThrown = thrown?.id === id;
          const isTop = depth === 0 && !isThrown;
          const hidden = depth >= VISIBLE && !isThrown;

          const transform = isThrown
            ? `translate(${thrown!.dir * 125}%, -10px) rotate(${thrown!.dir * 16}deg)`
            : css(pose(depth, lean), isTop && playing ? -PLAYING_NUDGE : 0);

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
                transition: isThrown ? `transform ${FLY}` : `transform ${SETTLE}, opacity 320ms ease`,
                pointerEvents: isTop ? "auto" : "none",
                willChange: depth < VISIBLE || isThrown ? "transform" : undefined,
              }}
            >
              <div
                ref={(el) => {
                  if (el) inner.current.set(id, el);
                  else inner.current.delete(id);
                }}
                style={{ transformOrigin: "50% 60%", touchAction: isTop ? "pan-y" : undefined }}
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
                onPointerCancel={isTop ? onPointerCancel : undefined}
              >
                {/* Every page with a song keeps its CD tucked at its edge, so a
                    card behind shows it has music. It is the same disc as the
                    card comes forward, so arriving at the front it slides out
                    smoothly as its song starts — from the top, round and round
                    until the card moves on. */}
                {entry.track && (
                  <DiaryDisc
                    track={entry.track}
                    size={DISC}
                    slide={PLAYING_SLIDE}
                    autoPlay={isTop}
                    className="absolute top-1/2 z-0"
                    style={DISC_AT}
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
            </div>
          );
        })}
      </div>

      {order.length > 1 && (
        <p className="mt-3 text-center text-xs font-semibold tabular-nums text-muted" aria-live="polite">
          <span className="text-foreground">{position + 1}</span>/{list.length}
        </p>
      )}
    </section>
  );
}
