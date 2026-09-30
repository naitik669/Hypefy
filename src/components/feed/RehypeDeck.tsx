"use client";

import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import type { DeckPerson } from "@/lib/rehype";

/**
 * The rehype deck: who passed this on, as a small loose row of faces.
 *
 * Three squircle faces at most — the people whose rehypes rank highest for
 * you (see fetchDeck), and you in the last seat once you have rehyped. Each is
 * tilted and set at its own height, so the row reads as a loose wave rather
 * than a shelf. One small rehype mark on the leading face says what the row
 * is. A face opens that person's profile.
 *
 * Motion is small and never blocks anything: the row rises in once when it
 * first appears, a face that joins pops into its seat, a face that leaves
 * pops out of it, and nothing moves at rest. Changes apply the moment the
 * parent's seating changes — there is no queue to wait behind — so a rehype
 * or an undo shows on the very next frame.
 *
 * The component only positions faces inside its own box; the caller places
 * the box (over a photo, or in a Shot's caption stack).
 */

/** Space between faces, as a share of the face size. */
const GAP = 1 / 3;
/** How far each seat is lifted, as a share of the face size — the wave. */
const RAISE = [0, 0.7, 0.25];
/** Each seat's tilt, degrees. */
const TILT = [-6, 5, -3];

type Motion = "rise" | "pop" | "idle" | "leave";
type Face = { person: DeckPerson; seat: number; motion: Motion };

const reducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * The faces to draw for a new seating. Faces already there keep their motion
 * and never replay; new ones rise (the row's first appearance) or pop (joining
 * a row already on show); ones no longer seated stay in their seat to pop out.
 * Exported for tests.
 */
export function reconcileFaces(faces: Face[], seated: DeckPerson[], instant = false): Face[] {
  const first = !faces.some((f) => f.motion !== "leave");
  const byId = new Map(faces.map((f) => [f.person.userId, f]));
  const next: Face[] = seated.map((person, seat) => {
    const had = byId.get(person.userId);
    if (had && had.motion !== "leave") return { person, seat, motion: had.motion };
    // New, or coming back while it was still on its way out.
    return { person, seat, motion: instant ? "idle" : first ? "rise" : "pop" };
  });
  if (instant) return next;
  const still = new Set(seated.map((p) => p.userId));
  const leaving = faces
    .filter((f) => !still.has(f.person.userId))
    .map((f) => ({ ...f, motion: "leave" as const }));
  return [...next, ...leaving];
}

export function RehypeDeck({ seated, size = 36 }: { seated: DeckPerson[]; size?: number }) {
  const [faces, setFaces] = useState<Face[]>([]);
  const [seenSeating, setSeenSeating] = useState<DeckPerson[]>([]);
  // Follow the parent during render rather than in an effect, so a change
  // shows on the same frame instead of one render late.
  if (seated !== seenSeating) {
    setSeenSeating(seated);
    setFaces((f) => reconcileFaces(f, seated, reducedMotion()));
  }

  const settle = (face: Face) =>
    setFaces((all) =>
      face.motion === "leave"
        ? all.filter((f) => !(f.motion === "leave" && f.person.userId === face.person.userId))
        : all.map((f) => (f.person.userId === face.person.userId && f.motion !== "leave" ? { ...f, motion: "idle" } : f)),
    );

  if (faces.length === 0) return null;

  const step = size * (1 + GAP);
  const seats = Math.max(...faces.map((f) => f.seat)) + 1;
  const names = seated.map((p) => (p.isMe ? "you" : p.name));

  return (
    <div
      role="group"
      aria-label={names.length ? `Rehyped by ${names.join(", ")}` : undefined}
      className="rehype-deck relative shrink-0"
      style={{ width: size + (seats - 1) * step, height: size * (1 + RAISE[1]) }}
      // A tap that starts on the deck belongs to the deck, never to the
      // gallery's swipe or double-tap-to-Hype underneath it.
      onTouchStart={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {faces.map((f) => {
        const p = f.person;
        const animation =
          f.motion === "rise"
            ? `deck-rise 0.36s ${f.seat * 60}ms cubic-bezier(0.2, 0.8, 0.2, 1) both`
            : f.motion === "pop"
              ? "deck-pop-in 0.32s cubic-bezier(0.34, 1.56, 0.64, 1) both"
              : f.motion === "leave"
                ? "deck-pop-out 0.18s ease-in forwards"
                : undefined;
        return (
          <Link
            key={f.motion === "leave" ? `${p.userId}-leaving` : p.userId}
            href={p.isMe ? "/profile" : p.username ? `/u/${p.username}` : "#"}
            aria-label={`${p.isMe ? "You" : p.name} rehyped this`}
            aria-hidden={f.motion === "leave" || undefined}
            tabIndex={f.motion === "leave" ? -1 : undefined}
            className={`absolute ${f.motion === "leave" ? "pointer-events-none" : ""}`}
            style={{ left: f.seat * step, bottom: (RAISE[f.seat] ?? 0) * size, width: size, height: size }}
          >
            <span className="block h-full w-full" style={{ animation }} onAnimationEnd={() => settle(f)}>
              <span
                className="relative block h-full w-full"
                style={{ transform: `rotate(${TILT[f.seat] ?? 0}deg)`, filter: "drop-shadow(0 3px 8px rgb(0 0 0 / 0.35))" }}
              >
                <Avatar name={p.name} hue={p.hue} src={p.avatarUrl ?? undefined} size={size} />
                {f.seat === 0 && f.motion !== "leave" && <RehypeMark />}
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}

/** The one sign that this row is rehypes: the Rehype arrows, on glass. */
function RehypeMark() {
  return (
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
  );
}
