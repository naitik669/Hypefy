"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Star } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { RehypeIcon } from "@/components/ui/RehypeIcon";
import type { DeckPerson } from "@/lib/rehype";

/**
 * The rehype deck: who passed this on, as a small loose row of floating faces.
 *
 * Three squircle faces at most — the people whose rehypes rank highest for
 * you (see fetchDeck), and you in the last seat once you have rehyped. Each is
 * tilted, set at its own height and drifting on its own slow cycle, so the row
 * reads as faces floating over the photo rather than a shelf of avatars. Each
 * carries the rehype mark, which is the only thing that says what the row is —
 * there is no caption.
 *
 * They are handled, not just looked at. Drag one and the others lean after it;
 * drag it far and they gather into a bubble behind your finger, which you can
 * carry off the photo entirely (the deck is rendered beside the picture, not
 * inside it, so nothing clips it). Let go outside and it stays gone until the
 * post comes round again; let go inside and they swing back to their seats.
 *
 * A tap that never became a drag replies to that rehype, which is what you
 * wanted to do with it — see RehypeReplySheet.
 *
 * Changes apply on the frame the parent's seating changes — nothing queues —
 * so a rehype or an undo shows at once. Faces already on show never replay
 * their entrance.
 *
 * The component only positions faces inside its own box; the caller places the
 * box.
 */

/** Space between faces, as a share of the face size. */
const GAP = 1 / 3;
/** How far each seat is lifted, as a share of the face size — the wave. */
const RAISE = [0, 0.7, 0.25];
/** Each seat's tilt, degrees. */
const TILT = [-6, 5, -3];
/** Drag this far from the seat and the row gathers into a bubble. */
const GATHER_PX = 64;
/** How far the others lean after a drag before that — just enough to feel tied together. */
const TRAIL = 0.14;
/** Where the gathered faces sit around the one you hold: a shallow fan, up and
 *  to the left, so each stays visible instead of hiding under the one in front
 *  (and clear of the finger, which covers the held face). Degrees. */
const FAN_FROM = 205;
const FAN_STEP = 50;
/** How far out they sit, as a share of the face size. */
const FAN = 0.62;
/** Movement beyond this makes it a drag rather than a tap. */
const TAP_PX = 6;
/**
 * How far a face may drift from its seat, in face widths, before it starts
 * to go — and how far before it is gone.
 *
 * Leaving the photograph was the only way to lose one, and on a tall
 * picture that is most of a screen of dragging for something the gesture
 * says you are already done with. Carrying a face well clear of where it
 * sits is the same intention, expressed with less of the arm.
 */
const DRIFT_FADE = 2;
const DRIFT_GONE = 3.6;

type Vec = { x: number; y: number };
type Motion = "rise" | "pop" | "idle" | "leave";
type Face = { person: DeckPerson; seat: number; motion: Motion };

/** Shared so "nothing dropped" is always the same value, and never re-runs the effect. */
const EMPTY_SET: ReadonlySet<string> = new Set();

const reducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * The faces to draw for a new seating. Faces already there keep their motion
 * and never replay; new ones rise (the row's first appearance) or pop (joining
 * a row already on show); ones no longer seated stay in their seat to pop out.
 *
 * `force` overrides what a new face does: "pop" for faces coming back after
 * being dropped off the photo, "idle" for reduced motion, which also drops the
 * exits. Exported for tests.
 */
export function reconcileFaces(faces: Face[], seated: DeckPerson[], force?: "idle" | "pop"): Face[] {
  const first = !faces.some((f) => f.motion !== "leave");
  const byId = new Map(faces.map((f) => [f.person.userId, f]));
  const next: Face[] = seated.map((person, seat) => {
    const had = byId.get(person.userId);
    if (had && had.motion !== "leave") return { person, seat, motion: had.motion };
    // New, or coming back while it was still on its way out.
    return { person, seat, motion: force ?? (first ? "rise" : "pop") };
  });
  if (force === "idle") return next;
  const still = new Set(seated.map((p) => p.userId));
  const leaving = faces
    .filter((f) => !still.has(f.person.userId))
    .map((f) => ({ ...f, motion: "leave" as const }));
  return [...next, ...leaving];
}

/**
 * Where each face sits during a drag, as an offset from its own seat.
 *
 * Up to the gather distance the row only leans after your finger. Past it the
 * others leave their seats and bunch around the face you are holding, fanned
 * so they read as a bubble of faces rather than one blurred pile.
 * Exported for tests.
 */
export function dragLayout(
  seats: Vec[],
  dragged: number,
  d: Vec,
  gatherAt = GATHER_PX,
  fan = 22,
): { gathered: boolean; offsets: Vec[] } {
  const gathered = Math.hypot(d.x, d.y) >= gatherAt;
  const hub = { x: seats[dragged].x + d.x, y: seats[dragged].y + d.y };
  let behind = 0;
  const offsets = seats.map((seat, i) => {
    if (i === dragged) return d;
    if (!gathered) return { x: d.x * TRAIL, y: d.y * TRAIL };
    const angle = ((FAN_FROM + behind++ * FAN_STEP) * Math.PI) / 180;
    return { x: hub.x + Math.cos(angle) * fan - seat.x, y: hub.y + Math.sin(angle) * fan - seat.y };
  });
  return { gathered, offsets };
}

/** A rectangle in the deck's own coordinates: the picture the faces live on. */
export type Box = { left: number; top: number; right: number; bottom: number };

/**
 * How visible a face is as it leaves the picture: fully there while it is
 * inside, fading as it crosses the edge, gone by the time half of it is out.
 *
 * A face carried off the photo must not go on floating over the Hype row or
 * the post below — it belongs to the picture, so it leaves with it.
 * Exported for tests.
 */
export function fadeDrift(offset: Vec, size: number): number {
  const away = Math.hypot(offset.x, offset.y) / size;
  if (away <= DRIFT_FADE) return 1;
  return Math.max(0, 1 - (away - DRIFT_FADE) / (DRIFT_GONE - DRIFT_FADE));
}

export function fadeOutside(face: Box, bounds: Box | null, over: number): number {
  if (!bounds) return 1;
  const out = Math.max(
    bounds.left - face.left,
    face.right - bounds.right,
    bounds.top - face.top,
    face.bottom - bounds.bottom,
    0,
  );
  return Math.max(0, 1 - out / over);
}

export function RehypeDeck({
  seated,
  size = 42,
  bounds,
  onPick,
  mark = "rehype",
}: {
  seated: DeckPerson[];
  size?: number;
  /**
   * What a face is here for when it does not say itself. One row seats
   * both kinds — see mergeDecks — so the mark normally rides on the
   * person; this is the fallback for a row that is all one thing.
   */
  mark?: "rehype" | "hype";
  /** The picture the deck sits on. Faces dragged past its edge fade out. */
  bounds?: RefObject<HTMLElement | null>;
  /** A tap on a face — a drag is not a tap, and never calls this. */
  onPick?: (person: DeckPerson) => void;
}) {
  const [faces, setFaces] = useState<Face[]>([]);
  const [seenSeating, setSeenSeating] = useState<DeckPerson[]>([]);
  const [drag, setDrag] = useState<{ index: number; d: Vec } | null>(null);
  // Measured when a drag starts, in the deck's own coordinates, so no layout
  // is read while the faces are moving.
  const [box, setBox] = useState<Box | null>(null);
  // Let go of a face off the photo and it is gone — not snapped back — until
  // the post is scrolled away and comes round again.
  const [dropped, setDropped] = useState<ReadonlySet<string>>(EMPTY_SET);
  const group = useRef<HTMLDivElement>(null);
  const from = useRef<Vec>({ x: 0, y: 0 });
  const moved = useRef(false);
  const here = useMemo(() => seated.filter((p) => !dropped.has(p.userId)), [seated, dropped]);
  // What the parent last said, for the observer below, which outlives a render.
  const latest = useRef(seated);
  useEffect(() => {
    latest.current = seated;
  }, [seated]);
  // Follow the parent during render rather than in an effect, so a change
  // shows on the same frame instead of one render late.
  if (seated !== seenSeating) {
    setSeenSeating(seated);
    setFaces((f) => reconcileFaces(f, here, reducedMotion() ? "idle" : undefined));
  }

  // Scrolling the post out of sight and back brings the dropped faces back,
  // popping into their seats. Nothing else does: a deck you cleared stays
  // cleared while you are looking at it.
  useEffect(() => {
    const el = group.current;
    if (!el || dropped.size === 0) return;
    let away = false;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          away = true;
        } else if (away) {
          away = false;
          setDropped(EMPTY_SET);
          setFaces((f) => reconcileFaces(f, latest.current, reducedMotion() ? "idle" : "pop"));
        }
      },
      { threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [dropped]);

  const settle = (face: Face) =>
    setFaces((all) =>
      face.motion === "leave"
        ? all.filter((f) => !(f.motion === "leave" && f.person.userId === face.person.userId))
        : all.map((f) => (f.person.userId === face.person.userId && f.motion !== "leave" ? { ...f, motion: "idle" } : f)),
    );

  // With everything dropped the box stays, empty: it is what the observer
  // above watches to know the post has scrolled by.
  if (faces.length === 0 && dropped.size === 0) return null;

  const step = size * (1 + GAP);
  const lift = (seat: number) => (RAISE[seat] ?? 0) * size;
  const seats = faces.map((f) => ({ x: f.seat * step, y: -lift(f.seat) }));
  const layout = drag ? dragLayout(seats, drag.index, drag.d, GATHER_PX, size * FAN) : null;
  const columns = faces.length ? Math.max(...faces.map((f) => f.seat)) + 1 : 1;
  const height = size * (1 + RAISE[1]);
  const names = here.map((p) => (p.isMe ? "you" : p.name));

  function onDown(e: React.PointerEvent, index: number) {
    e.stopPropagation();
    // Keeps the gesture on this face even when the finger leaves it, which is
    // the normal case here — the whole point is to drag it away.
    e.currentTarget.setPointerCapture?.(e.pointerId);
    from.current = { x: e.clientX, y: e.clientY };
    moved.current = false;
    const picture = bounds?.current?.getBoundingClientRect();
    const mine = group.current?.getBoundingClientRect();
    setBox(
      picture && mine
        ? {
            left: picture.left - mine.left,
            top: picture.top - mine.top,
            right: picture.right - mine.left,
            bottom: picture.bottom - mine.top,
          }
        : null,
    );
    setDrag({ index, d: { x: 0, y: 0 } });
  }
  /** Let go: anything that has faded out stays gone, the rest swing back. */
  function onUp(shown: number[]) {
    const gone = faces.filter((_, i) => shown[i] === 0).map((f) => f.person.userId);
    if (gone.length) {
      setDropped((d) => new Set([...d, ...gone]));
      setFaces((all) => all.filter((f) => !gone.includes(f.person.userId)));
    }
    setDrag(null);
  }
  function onMove(e: React.PointerEvent, index: number) {
    if (drag?.index !== index) return;
    const d = { x: e.clientX - from.current.x, y: e.clientY - from.current.y };
    if (Math.hypot(d.x, d.y) > TAP_PX) moved.current = true;
    setDrag({ index, d });
  }

  // How much of each face is still on the picture. One per face, so letting
  // go knows which ones have left for good.
  const shownAll = faces.map((f, i) => {
    if (!drag) return 1;
    const offset = layout?.offsets[i] ?? { x: 0, y: 0 };
    const top = height - lift(f.seat) - size + offset.y;
    const left = seats[i].x + offset.x;
    // Whichever says it has gone first: off the picture, or simply far
    // from where it belongs. Once the row has gathered they all travel
    // with the held one, so the whole bubble goes together, which is
    // what carrying it away looks like it should do.
    return Math.min(
      fadeOutside({ left, top, right: left + size, bottom: top + size }, box, size * 0.5),
      fadeDrift(offset, size),
    );
  });

  return (
    <div
      ref={group}
      role="group"
      aria-label={names.length ? `Rehyped by ${names.join(", ")}` : undefined}
      // Dragging a face sideways is this deck's gesture, not the app's. The
      // gallery behind only claims the sideways drag when it has more than
      // one image to move between, so on a single-image post nothing stood
      // the tab swipe down and pulling a face off changed tab instead.
      data-hswipe=""
      className="rehype-deck pointer-events-auto relative shrink-0"
      style={{ width: size + (columns - 1) * step, height }}
      /*
       * A touch that starts on the deck belongs to the deck, never to the
       * gallery's swipe or double-tap-to-Hype underneath it — and never to
       * the tab swipe either.
       *
       * All three, not just the start. Holding only the start left the tab
       * swipe seeing moves for a gesture it had never seen begin, so it
       * measured them against wherever the last touch happened to start,
       * decided that was a long sideways drag, and changed page while a
       * face was being carried across the photo.
       */
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      onTouchCancel={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {faces.map((f, i) => {
        const p = f.person;
        const leaving = f.motion === "leave";
        const held = drag?.index === i;
        const off = layout?.offsets[i] ?? { x: 0, y: 0 };
        const shown = shownAll[i];
        const animation =
          f.motion === "rise"
            ? `deck-rise 0.36s ${f.seat * 60}ms cubic-bezier(0.2, 0.8, 0.2, 1) both`
            : f.motion === "pop"
              ? "deck-pop-in 0.32s cubic-bezier(0.34, 1.56, 0.64, 1) both"
              : leaving
                ? "deck-pop-out 0.18s ease-in forwards"
                : // At rest they drift, each on its own slow cycle. A hand on
                  // the deck stops the drifting, so only your drag moves them.
                  drag
                  ? undefined
                  : `deck-float ${8.6 + f.seat * 1.4}s ${f.seat * 1.1}s ease-in-out infinite`;
        return (
          <button
            type="button"
            key={leaving ? `${p.userId}-leaving` : p.userId}
            aria-label={`${p.isMe ? "You" : p.name} rehyped this. Reply to it`}
            aria-hidden={leaving || undefined}
            tabIndex={leaving ? -1 : undefined}
            draggable={false}
            // Without this the browser starts its own drag of the photo
            // inside the avatar on the first move, which cancels the pointer
            // stream and drops the face back into its seat.
            onDragStart={(e) => e.preventDefault()}
            className={`absolute select-none ${leaving ? "pointer-events-none" : ""}`}
            style={{
              left: seats[i].x,
              bottom: lift(f.seat),
              width: size,
              height: size,
              touchAction: "none",
              zIndex: held ? 2 : 1,
              opacity: shown,
              // Once it has faded out it is not there to be tapped either.
              visibility: shown === 0 ? "hidden" : undefined,
              transform: `translate3d(${off.x}px, ${off.y}px, 0)`,
              // The face in your hand tracks it exactly; the others glide
              // after it, and everyone swings back when you let go.
              transition: drag
                ? held
                  ? "opacity 0.12s linear"
                  : "transform 0.24s ease-out, opacity 0.12s linear"
                : "transform 0.55s cubic-bezier(0.22, 1.1, 0.36, 1), opacity 0.3s ease-out",
            }}
            onPointerDown={(e) => !leaving && onDown(e, i)}
            onPointerMove={(e) => onMove(e, i)}
            onPointerUp={() => onUp(shownAll)}
            // A cancelled gesture is not a decision: everyone comes home.
            onPointerCancel={() => setDrag(null)}
            // A drag is not a tap: it must not open anything on release.
            onClick={() => !moved.current && !leaving && onPick?.(p)}
          >
            <span className="block h-full w-full" style={{ animation }} onAnimationEnd={() => settle(f)}>
              <span
                className="relative block h-full w-full transition-transform duration-200"
                style={{
                  transform: `rotate(${TILT[f.seat] ?? 0}deg) scale(${layout?.gathered && !held ? 0.88 : 1})`,
                  filter: "drop-shadow(0 3px 8px rgb(0 0 0 / 0.35))",
                }}
              >
                <Avatar name={p.name} hue={p.hue} src={p.avatarUrl ?? undefined} size={size} />
                {!leaving && <DeckMark size={size} mark={f.person.mark ?? mark} />}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * What says why a face is here, now that nothing is written above the row.
 *
 * The two marks are not built the same, on purpose. A rehype is a thin
 * white line drawing and needs a dark plate under it to survive whatever
 * photo it lands on. A hype is the gold star the rest of the app already
 * uses for hyping, and a star is legible as itself — on a plate it read as
 * a grey chip stuck to the corner of a face rather than as a star on it.
 * So the star sits straight on the face, bigger, with a dark rim and a
 * shadow to hold it against a pale avatar.
 */
function DeckMark({ size, mark }: { size: number; mark: "rehype" | "hype" }) {
  if (mark === "hype") {
    return (
      <span
        className="absolute -bottom-1.5 -right-1.5 text-hype"
        // A dark halo rather than a dark outline. A stroke of another colour
        // would not just darken the edge, it would reshape the star: the
        // round join on a stroke the same colour as the fill is the whole
        // reason the points are curved rather than spiked.
        style={{ filter: "drop-shadow(0 0 1px rgba(0,0,0,0.6)) drop-shadow(0 1px 2px rgba(0,0,0,0.5))" }}
        aria-hidden
      >
        {/* The hype button's own star, at its own stroke weight, so the two
            are the same shape rather than two drawings of a star. Filled,
            because the button wears an outline when you have NOT hyped
            something — an outline here would say the opposite of what the
            face is for. */}
        <Star size={Math.round(size * 0.52)} strokeWidth={2.2} fill="currentColor" />
      </span>
    );
  }

  const box = Math.round(size * 0.47);
  return (
    <span
      className="absolute -bottom-1 -right-1 flex items-center justify-center rounded-[30%] text-white"
      style={{
        width: box,
        height: box,
        // Brand lime falling to the deep end. The light corner is real
        // lime, which is the point of it.
        background:
          "linear-gradient(135deg, var(--color-accent), var(--color-accent-deep))",
        boxShadow: "0 1px 2px rgba(0,0,0,0.45)",
      }}
      aria-hidden
    >
      {/* The rehype button's own loop, so the mark and the button are one
          drawing rather than two. Inactive: active would paint it lime,
          and on a lime plate that is a loop you cannot see.

          The shadow is doing real work, not decoration. White on brand
          lime is 1.5:1, and the gradient's light end sits exactly under
          the upper arrow — without something behind it that arrow
          dissolves into the plate. */}
      <RehypeIcon
        size={Math.round(box * 0.68)}
        strokeWidth={2.8}
        className="text-white [filter:drop-shadow(0_0_1.2px_rgba(0,0,0,0.75))]"
      />
    </span>
  );
}
