"use client";

import { useEffect, useState } from "react";

/**
 * The party a finished countdown throws.
 *
 * A countdown whose moment had passed simply read "It's happening", which is
 * the quietest possible way to say that the thing somebody was waiting for has
 * arrived. So the numbers run out to zero and the Show throws confetti.
 *
 * Bounded on purpose. The audit that preceded this work found the app's
 * freezes came from unbounded DOM and unbounded live media, and the Show
 * viewer is already running a story clock, a video and a song — so this mounts
 * only for a countdown that has just finished, takes itself down on a timer,
 * and never mounts at all for somebody who has asked for less motion.
 */

/** Enough to read as a burst; few enough to cost nothing. */
const PIECES = 42;
/** The longest a piece can fall for, plus its longest delay. */
const LIFE_MS = 3400;

const COLOURS = ["#a3e635", "#22c55e", "#ffd000", "#f97316", "#db2777", "#6366f1", "#ffffff"];

export function Celebrate() {
  const [done, setDone] = useState(false);
  /*
   * Read once, in the initialiser rather than an effect: it cannot change
   * during the three seconds this exists, and setting state from an effect
   * body is a cascading render for a value that was knowable at mount.
   *
   * Nothing server-renders this — it is mounted by a client effect once a
   * countdown has run out — so reading matchMedia here cannot disagree with
   * a server render.
   */
  const [calm] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const t = setTimeout(() => setDone(true), LIFE_MS);
    return () => clearTimeout(t);
  }, []);

  if (done || calm) return null;

  return (
    <span
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 30,
      }}
    >
      {Array.from({ length: PIECES }, (_, i) => {
        // Deterministic from the index rather than Math.random, so the server
        // and the client agree and nothing has to wait for hydration.
        const left = ((i * 37) % 100) + (i % 3) * 0.5;
        const fall = 1.5 + ((i * 13) % 14) / 10;
        const delay = ((i * 7) % 9) / 20;
        const spin = 0.4 + ((i * 11) % 6) / 10;
        return (
          <span
            key={i}
            style={{
              position: "absolute",
              top: -16,
              left: `${left}%`,
              animation: `show-confetti-fall ${fall}s linear ${delay}s forwards`,
            }}
          >
            <span
              style={{
                display: "block",
                width: 7,
                height: 11,
                borderRadius: 2,
                background: COLOURS[i % COLOURS.length],
                animation: `show-confetti-spin ${spin}s linear infinite`,
              }}
            />
          </span>
        );
      })}
      {/*
        Two animations on two elements: falling and turning at once on one
        element means one of the two transforms wins and the pieces drop
        without rotating.
      */}
      <style>{`
        @keyframes show-confetti-fall {
          to { transform: translateY(110vh); opacity: 0.15; }
        }
        @keyframes show-confetti-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </span>
  );
}
