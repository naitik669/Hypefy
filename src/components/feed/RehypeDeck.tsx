"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { routeStops, type DeckPerson } from "@/lib/rehype";

/**
 * The rehype deck: who passed this post on, sitting at the bottom of the photo.
 *
 * Three squircle faces at most — the people whose rehypes rank highest for
 * you (see fetchDeck), and you in the last seat once you have rehyped it. Each is tilted and set at
 * its own height, so the row reads as a loose wave rather than a shelf, and
 * each carries the rehype arrows so it can't be mistaken for a tag.
 *
 * A tap plays the relay route: the faces pop off the row and back on at their
 * stops along the path the post travelled — the author, each rehype it passed
 * through, then you — hold for a moment, and bubble back into the row.
 *
 * What is on screen (`shown`) is kept apart from what the parent says is true
 * (`seated`): a change that lands mid-animation — you rehyping, the data
 * arriving late — waits for the current motion to finish instead of making
 * faces jump. Only faces that are new to the row animate in.
 */

/** Face size, px. */
const S = 38;
/** Space between faces, px. */
const GAP = 14;
/** How far each seat is lifted off the bottom — the wave. */
const RAISE = [0, 34, 12];
/** Each seat's tilt, degrees. */
const TILT = [-8, 6, -4];
/** Tilt for route stops, in order. */
const ROUTE_TILT = [-6, 5, -4, 4, -5, 6];
/** How long the route stays once drawn. */
const HOLD_MS = 500;
/** Time for the line to draw, and when it starts. */
const DRAW_MS = 800;
const DRAW_DELAY_MS = 120;

/** What the post calls when you rehype or undo, so the deck can show it. */
export type RehypeDeckHandle = {
  /** You rehyped: play the route ending with you, then take your seat. */
  playRehype: (route: DeckPerson[]) => void;
  /** You undid it: your seat goes back to whoever you displaced. */
  undo: () => void;
};

type Face = { person: DeckPerson; enter: boolean };
/** The photo's size is measured when the route opens, not during render. */
type Route = { people: DeckPerson[]; endsAtYou: boolean; bigLast: boolean; w: number; h: number };

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

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
  const [leaving, setLeaving] = useState(false);
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

  /** Bring the row in line with `seated`, animating only faces that are new to it. */
  const sync = useCallback((all: boolean) => {
    let entering = false;
    setShown((prev) => {
      const same =
        !all &&
        prev.length === latest.current.length &&
        prev.every((f, i) => f.person.userId === latest.current[i].userId);
      // Nothing changed: keep the same array, so a parent re-render never
      // turns into a render loop here.
      if (same) return prev;
      const had = new Set(prev.map((f) => f.person.userId));
      const next = latest.current.map((person) => ({ person, enter: all || !had.has(person.userId) }));
      entering = next.some((f) => f.enter);
      return next;
    });
    // Once the entrance has played, let the faces settle into their idle bob.
    timers.current.push(
      setTimeout(() => {
        if (entering) setShown((prev) => prev.map((f) => (f.enter ? { ...f, enter: false } : f)));
      }, 1400),
    );
  }, []);

  // Outside any motion, follow the parent — e.g. the deck's data arriving.
  useEffect(() => {
    if (!busy.current) sync(false);
  }, [seated, sync]);

  const closeRoute = useCallback(() => {
    setDraining(false);
    setRouteLeaving(true);
    later(() => {
      setRoute(null);
      setRouteLeaving(false);
      setDrawn(false);
      setLeaving(false);
      sync(true); // everyone bubbles back, in whatever seats are now true
      later(() => {
        busy.current = false;
      }, 1100);
    }, reducedMotion() ? 0 : 330);
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
      setLeaving(true);
      later(() => {
        setRoute(next);
        requestAnimationFrame(() => requestAnimationFrame(() => setDrawn(true)));
        const shownAt = reducedMotion() ? 0 : DRAW_DELAY_MS + DRAW_MS + 350;
        later(() => {
          setDraining(true);
          later(closeRoute, HOLD_MS);
        }, shownAt);
      }, reducedMotion() ? 0 : 190);
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
          prev.map((f) => (f.person.isMe ? { enter: false, person: { ...f.person, userId: "__leaving" } } : f)),
        );
        later(() => {
          sync(false);
          later(() => {
            busy.current = false;
          }, 900);
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
      <div role="group" aria-label={`Rehyped by ${names.join(", ")}`}>
        {shown.map((f, i) => {
          const goingOut = leaving || f.person.userId === "__leaving";
          return (
            <button
              key={f.person.userId === "__leaving" ? `leaving-${i}` : f.person.userId}
              type="button"
              onClick={(e) => void onTap(e, f.person)}
              aria-label={`${f.person.isMe ? "You" : f.person.name} rehyped this. Show how it reached you`}
              className="pointer-events-auto absolute"
              style={{
                left: 12 + i * (S + GAP),
                bottom: 14 + (RAISE[i] ?? 0),
                width: S,
                height: S,
                visibility: route ? "hidden" : undefined,
                animation: goingOut || f.enter ? undefined : `deck-bob 3.4s ${i * 0.45}s ease-in-out infinite`,
              }}
            >
              <span
                className="block h-full w-full"
                style={{
                  animation: goingOut
                    ? "deck-pop-out 0.2s ease-in forwards"
                    : f.enter
                      ? `deck-bubble 0.9s ${i * 0.15}s cubic-bezier(0.3, 0.9, 0.4, 1) both`
                      : undefined,
                }}
              >
                <DeckFace person={f.person} tilt={TILT[i] ?? 0} />
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

/** One face: the avatar in a lime squircle ring (white for you), tilted, with the rehype badge. */
function DeckFace({ person, tilt }: { person: DeckPerson; tilt: number }) {
  return (
    <span className="relative block h-full w-full">
      <span
        className={`block h-full w-full rounded-[30%] p-[2.5px] ${person.isMe ? "bg-white" : "bg-accent"}`}
        style={{ transform: `rotate(${tilt}deg)` }}
      >
        <Avatar name={person.name} hue={person.hue} src={person.avatarUrl ?? undefined} size={S - 5} />
      </span>
      <span
        className="absolute -bottom-1.5 -right-1.5 flex h-[18px] w-[18px] items-center justify-center rounded-[30%] border-2 border-black bg-accent"
        style={{ transform: `rotate(${tilt}deg)` }}
        aria-hidden
      >
        <svg viewBox="0 0 24 24" width={11} height={11} fill="none" stroke="#13200a" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 18H7a2 2 0 0 1-2-2V6" />
          <path d="m2 9 3-3 3 3" />
          <path d="M11 6h6a2 2 0 0 1 2 2v10" />
          <path d="m22 15-3 3-3-3" />
        </svg>
      </span>
      {person.isMe && (
        <span className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-white px-1.5 text-[9px] font-bold text-black">
          You
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
      className="pointer-events-auto absolute inset-0 cursor-default"
    >
      <span
        className="absolute inset-0 bg-black transition-opacity duration-300"
        style={{ opacity: leaving ? 0 : 0.35 }}
        aria-hidden
      />
      <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${W} ${H}`} aria-hidden>
        <path
          d={d}
          pathLength={1}
          fill="none"
          stroke="rgb(163 230 53)"
          strokeWidth={3}
          strokeLinecap="round"
          className={`rehype-route-path ${drawn ? "is-drawn" : ""}`}
          style={{ opacity: leaving ? 0 : 1 }}
        />
      </svg>

      <span
        className="absolute inset-x-2.5 top-2.5 truncate rounded-full bg-black/85 px-3 py-1 text-center text-[11px] font-semibold text-white transition-opacity duration-300"
        style={{ opacity: leaving ? 0 : 1 }}
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
                animation: leaving
                  ? `deck-pop-out 0.2s ${k * 40}ms ease-in forwards`
                  : `${big ? "deck-pop-in-big 0.5s" : "deck-pop-in 0.38s"} ${popAt(k)}ms cubic-bezier(0.34, 1.56, 0.64, 1) both`,
              }}
            >
              <DeckFace person={p} tilt={ROUTE_TILT[k % ROUTE_TILT.length]} />
            </span>
          </span>
        );
      })}

      {end && (
        <span
          className="absolute h-3.5 w-3.5 rounded-full border-[3px] border-black bg-accent"
          style={{
            left: end.x - 7,
            top: end.y - 7,
            animation: leaving ? "deck-pop-out 0.2s ease-in forwards" : `deck-pop-in 0.3s ${DRAW_DELAY_MS + DRAW_MS - 50}ms both`,
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
