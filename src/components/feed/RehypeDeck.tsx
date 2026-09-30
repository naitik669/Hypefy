"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { routeStops, type DeckPerson } from "@/lib/rehype";

/**
 * The rehype deck: who passed this post on, sitting at the bottom of the photo.
 *
 * Three squircle faces at most — the people whose rehypes rank highest for
 * you (see fetchDeck), and you in the last seat once you have rehyped it. Each
 * is tilted and set at its own height, so the row reads as a loose wave rather
 * than a shelf. One small rehype mark on the leading face says what the row
 * is; the faces themselves are bare — no rings, no labels.
 *
 * A tap plays the relay route: the row fades away, the line draws from the
 * author through each rehype it passed through, the faces pop onto their
 * stops, hold for a moment, and the whole layer fades back to the row.
 *
 * Motion is kept deliberately small: faces rise in once when the deck first
 * loads, a face that joins later pops into its own seat, and nothing moves at
 * rest. Faces already on show never re-animate.
 *
 * What is on screen (`shown`) is kept apart from what the parent says is true
 * (`seated`): a change that lands mid-animation — you rehyping, the data
 * arriving late — waits for the current motion to finish instead of making
 * faces jump.
 */

/** Face size, px. */
const S = 36;
/** Space between faces, px. */
const GAP = 12;
/** How far each seat is lifted off the bottom — the wave. */
const RAISE = [0, 26, 9];
/** Each seat's tilt, degrees. */
const TILT = [-6, 5, -3];
/** Tilt for route stops, in order. */
const ROUTE_TILT = [-6, 5, -4, 4, -5, 6];
/** How long the route stays once drawn. */
const HOLD_MS = 500;
/** Time for the line to draw, and when it starts. */
const DRAW_MS = 800;
const DRAW_DELAY_MS = 120;
/** The row fading out before the route appears, and the route fading away. */
const ROW_FADE_MS = 190;
const ROUTE_FADE_MS = 260;

/** What the post calls when you rehype or undo, so the deck can show it. */
export type RehypeDeckHandle = {
  /** You rehyped: play the route ending with you, then take your seat. */
  playRehype: (route: DeckPerson[]) => void;
  /** You undid it: your seat goes back to whoever you displaced. */
  undo: () => void;
};

/** `rise`: the deck's first appearance. `pop`: one face joining a row already on show. */
type Face = { person: DeckPerson; enter: "rise" | "pop" | null };
/** The photo's size is measured when the route opens, not during render. */
type Route = { people: DeckPerson[]; endsAtYou: boolean; bigLast: boolean; w: number; h: number };

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** A soft shadow, so bare faces still separate from a busy photo. */
const LIFT = "drop-shadow(0 3px 8px rgb(0 0 0 / 0.35))";

export function RehypeDeck({
  ref,
  seated,
  loadRoute,
  authorName,
}: {
  ref?: Ref<RehypeDeckHandle>;
  /** Who sits in the deck, per seatDeck(). */
  seated: DeckPerson[];
  /** The route to the face that was tapped, and whether it carries on to "you". */
  loadRoute: (tapped: DeckPerson) => Promise<{ people: DeckPerson[]; endsAtYou: boolean }>;
  authorName: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState<Face[]>([]);
  const [rowHidden, setRowHidden] = useState(false);
  const [route, setRoute] = useState<Route | null>(null);
  const [routeLeaving, setRouteLeaving] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const [draining, setDraining] = useState(false);
  const busy = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const latest = useRef(seated);
  useEffect(() => {
    latest.current = seated;
  }, [seated]);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  /** Bring the row in line with `seated`; only faces new to it animate. */
  const sync = useCallback(() => {
    setShown((prev) => {
      const want = latest.current;
      const same = prev.length === want.length && prev.every((f, i) => f.person.userId === want[i].userId);
      // Nothing changed: keep the same array, so a parent re-render never
      // turns into a render loop here.
      if (same) return prev;
      const had = new Map(prev.map((f) => [f.person.userId, f]));
      const first = prev.length === 0;
      return want.map((person) => {
        const old = had.get(person.userId);
        // Faces already on show keep whatever they were doing, and never replay.
        if (old) return { person, enter: old.enter };
        return { person, enter: first ? "rise" : "pop" };
      });
    });
  }, []);

  // Outside any motion, follow the parent — e.g. the deck's data arriving.
  useEffect(() => {
    if (!busy.current) sync();
  }, [seated, sync]);

  /** An entrance has played: drop the flag so a re-render can't replay it. */
  const settled = (userId: string) =>
    setShown((prev) => prev.map((f) => (f.person.userId === userId && f.enter ? { ...f, enter: null } : f)));

  const closeRoute = useCallback(() => {
    setDraining(false);
    setRouteLeaving(true);
    later(() => {
      setRoute(null);
      setRouteLeaving(false);
      setDrawn(false);
      setRowHidden(false);
      sync(); // the row fades back; only a seat that changed pops
      later(() => {
        busy.current = false;
      }, 400);
    }, reducedMotion() ? 0 : ROUTE_FADE_MS);
  }, [sync]);

  const openRoute = useCallback(
    (spec: Omit<Route, "w" | "h">) => {
      const next: Route = { ...spec, w: box.current?.clientWidth ?? 360, h: box.current?.clientHeight ?? 360 };
      if (next.people.length === 0) {
        busy.current = false;
        return;
      }
      busy.current = true;
      timers.current.forEach(clearTimeout);
      timers.current = [];
      setRowHidden(true);
      later(() => {
        setRoute(next);
        requestAnimationFrame(() => requestAnimationFrame(() => setDrawn(true)));
        const shownAt = reducedMotion() ? 0 : DRAW_DELAY_MS + DRAW_MS + 350;
        later(() => {
          setDraining(true);
          later(closeRoute, HOLD_MS);
        }, shownAt);
      }, reducedMotion() ? 0 : ROW_FADE_MS);
    },
    [closeRoute],
  );

  async function onTap(e: React.MouseEvent, tapped: DeckPerson) {
    e.stopPropagation();
    if (busy.current) return;
    busy.current = true;
    const r = await loadRoute(tapped);
    openRoute({ people: r.people, endsAtYou: r.endsAtYou, bigLast: false });
  }

  // The post tells the deck what you did; a rehype plays the route first, an
  // undo swaps one seat.
  useImperativeHandle(
    ref,
    () => ({
      playRehype(people) {
        openRoute({ people, endsAtYou: false, bigLast: true });
      },
      undo() {
        busy.current = true;
        // Your face leaves its seat; whoever you displaced comes back into it.
        setShown((prev) =>
          prev.map((f) => (f.person.isMe ? { enter: null, person: { ...f.person, userId: "__leaving" } } : f)),
        );
        later(() => {
          sync();
          later(() => {
            busy.current = false;
          }, 400);
        }, reducedMotion() ? 0 : 230);
      },
    }),
    [openRoute, sync],
  );

  if (shown.length === 0 && !route) return null;

  const names = shown.map((f) => (f.person.isMe ? "you" : f.person.name));

  return (
    <div
      ref={box}
      className="rehype-deck pointer-events-none absolute inset-0 z-10"
      // A tap or a swipe that starts on the deck belongs to the deck, never
      // to the gallery's swipe or double-tap-to-Hype underneath it.
      onTouchStart={(e) => e.stopPropagation()}
    >
      {/* The row */}
      <div
        role="group"
        aria-label={`Rehyped by ${names.join(", ")}`}
        className="transition-[opacity,transform] duration-200 ease-out"
        style={{ opacity: rowHidden ? 0 : 1, transform: rowHidden ? "translateY(6px)" : undefined }}
      >
        {shown.map((f, i) => {
          const goingOut = f.person.userId === "__leaving";
          const animation = goingOut
            ? "deck-pop-out 0.2s ease-in forwards"
            : f.enter === "rise"
              ? `deck-rise 0.42s ${i * 70}ms cubic-bezier(0.2, 0.8, 0.2, 1) both`
              : f.enter === "pop"
                ? "deck-pop-in 0.38s cubic-bezier(0.34, 1.56, 0.64, 1) both"
                : undefined;
          return (
            <button
              key={goingOut ? `leaving-${i}` : f.person.userId}
              type="button"
              onClick={(e) => void onTap(e, f.person)}
              aria-label={`${f.person.isMe ? "You" : f.person.name} rehyped this. Show how it reached you`}
              className={`absolute ${rowHidden ? "" : "pointer-events-auto"}`}
              style={{ left: 12 + i * (S + GAP), bottom: 14 + (RAISE[i] ?? 0), width: S, height: S }}
            >
              <span
                className="block h-full w-full"
                style={{ animation }}
                onAnimationEnd={() => f.enter && settled(f.person.userId)}
              >
                <DeckFace person={f.person} tilt={TILT[i] ?? 0} mark={i === 0} />
              </span>
            </button>
          );
        })}
      </div>

      {route && (
        <RouteLayer
          route={route}
          drawn={drawn}
          leaving={routeLeaving}
          draining={draining}
          authorName={authorName}
          onClose={(e) => {
            e.stopPropagation();
            if (!routeLeaving) {
              timers.current.forEach(clearTimeout);
              timers.current = [];
              closeRoute();
            }
          }}
        />
      )}
    </div>
  );
}

/** One face: the bare squircle avatar, tilted, lifted off the photo by a soft shadow. */
function DeckFace({ person, tilt, mark = false }: { person: DeckPerson; tilt: number; mark?: boolean }) {
  return (
    <span className="relative block h-full w-full" style={{ transform: `rotate(${tilt}deg)`, filter: LIFT }}>
      <Avatar name={person.name} hue={person.hue} src={person.avatarUrl ?? undefined} size={S} />
      {mark && (
        // The one sign that this row is rehypes: the Rehype mark itself, on glass.
        <span
          className="absolute -bottom-1 -right-1 flex h-[17px] w-[17px] items-center justify-center rounded-[30%] bg-black/55 text-white backdrop-blur-md"
          aria-hidden
        >
          <svg viewBox="0 0 24 24" width={11} height={11} fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 18H7a2 2 0 0 1-2-2V6" />
            <path d="m2 9 3-3 3 3" />
            <path d="M11 6h6a2 2 0 0 1 2 2v10" />
            <path d="m22 15-3 3-3-3" />
          </svg>
        </span>
      )}
    </span>
  );
}

/** The relay route: a line from the author through each rehype to you, with faces at the stops. */
function RouteLayer({
  route,
  drawn,
  leaving,
  draining,
  authorName,
  onClose,
}: {
  route: Route;
  drawn: boolean;
  leaving: boolean;
  draining: boolean;
  authorName: string;
  onClose: (e: React.MouseEvent) => void;
}) {
  const W = route.w;
  const H = route.h;
  const stops = routeStops(route.people.length).map((p) => ({ x: p.x * W, y: p.y * H }));
  const end = route.endsAtYou ? { x: W * 0.1, y: H * 0.86 } : null;

  const pts = [{ x: -10, y: -10 }, ...stops, ...(end ? [end] : [])];
  let d = `M${pts[0].x} ${pts[0].y}`;
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1];
    const b = pts[k];
    d += ` Q ${(a.x + b.x) / 2 + (k % 2 ? 34 : -34)} ${(a.y + b.y) / 2} ${b.x} ${b.y}`;
  }
  const segments = pts.length - 1;
  const popAt = (k: number) => DRAW_DELAY_MS + (DRAW_MS * (k + 1)) / segments - 60;

  const chain = [authorName, ...route.people.map((p) => (p.isMe ? "you" : p.name)), ...(end ? ["you"] : [])];

  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={`How this reached you: ${chain.join(", then ")}. Tap to close`}
      className="pointer-events-auto absolute inset-0 cursor-default transition-opacity ease-out"
      // The whole layer fades as one, in and out — nothing pops off piece by piece.
      style={{
        opacity: leaving ? 0 : 1,
        transitionDuration: `${ROUTE_FADE_MS}ms`,
        animation: "deck-fade-in 0.22s ease-out both",
      }}
    >
      <span className="absolute inset-0 bg-black/30" aria-hidden />
      <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${W} ${H}`} aria-hidden>
        <path
          d={d}
          pathLength={1}
          fill="none"
          stroke="rgb(163 230 53)"
          strokeWidth={3}
          strokeLinecap="round"
          className={`rehype-route-path ${drawn ? "is-drawn" : ""}`}
        />
      </svg>

      <span
        className="absolute inset-x-2.5 top-2.5 truncate rounded-full bg-black/70 px-3 py-1 text-center text-[11px] font-semibold text-white backdrop-blur-md"
        aria-hidden
      >
        {chain.map((name, i) => (
          <span key={i}>
            {i > 0 && <span className="text-accent"> → </span>}
            {name}
          </span>
        ))}
      </span>

      {route.people.map((p, k) => {
        const big = route.bigLast && k === route.people.length - 1;
        return (
          <span
            key={p.userId}
            className="absolute"
            style={{ left: stops[k].x - S / 2, top: stops[k].y - S / 2, width: S, height: S }}
            aria-hidden
          >
            <span
              className="block h-full w-full"
              style={{
                animation: `${big ? "deck-pop-in-big 0.5s" : "deck-pop-in 0.38s"} ${popAt(k)}ms cubic-bezier(0.34, 1.56, 0.64, 1) both`,
              }}
            >
              <DeckFace person={p} tilt={ROUTE_TILT[k % ROUTE_TILT.length]} />
            </span>
          </span>
        );
      })}

      {end && (
        <span
          className="absolute h-3 w-3 rounded-full bg-accent"
          style={{
            left: end.x - 6,
            top: end.y - 6,
            filter: LIFT,
            animation: `deck-pop-in 0.3s ${DRAW_DELAY_MS + DRAW_MS - 50}ms both`,
          }}
          aria-hidden
        />
      )}

      {/* How long the route stays, counting down along the bottom. */}
      <span
        className="absolute inset-x-2.5 bottom-0 h-0.5 origin-left bg-accent"
        style={{ transform: "scaleX(0)", animation: draining ? `deck-drain ${HOLD_MS}ms linear forwards` : undefined }}
        aria-hidden
      />
    </button>
  );
}
