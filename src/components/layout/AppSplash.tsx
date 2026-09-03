"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Opening screen for the app.
 *
 * Shown once per session, not per navigation — a splash on every route
 * change is a stutter, not a brand. sessionStorage rather than localStorage
 * so it returns each time the app is genuinely opened, which in the native
 * shell is a fresh WebView.
 *
 * It never blocks: the app renders underneath the whole time and this fades
 * off on a timer, so a slow line delays the reveal rather than the product.
 */

/**
 * Kept to things the app actually does. A splash is a bad place to promise
 * behaviour that does not exist — it is the first thing a new account reads.
 */
const FACTS = [
  "Shows disappear after a day. Your posts stay put.",
  "Hold the profile tab to switch accounts.",
  "Every profile carries a QR code. Scan to connect.",
  "Your profile is a canvas, not a template.",
  "Hype is applause you can actually see.",
];

const HOLD_MS = 1250;
const FADE_MS = 420;
const KEY = "hypefy_splash_shown";

export function AppSplash() {
  // Start hidden and switch on in an effect. Rendering it during SSR would
  // flash the splash on every server-rendered navigation before the session
  // check could run.
  const [phase, setPhase] = useState<"idle" | "in" | "out">("idle");
  const [fact, setFact] = useState(FACTS[0]);

  useEffect(() => {
    let seen = true;
    try {
      seen = sessionStorage.getItem(KEY) === "1";
      if (!seen) sessionStorage.setItem(KEY, "1");
    } catch {
      // Private mode or blocked storage — show it and move on.
      seen = false;
    }
    if (seen) return;

    setFact(FACTS[Math.floor(Math.random() * FACTS.length)]);
    setPhase("in");

    const t1 = setTimeout(() => setPhase("out"), HOLD_MS);
    const t2 = setTimeout(() => setPhase("idle"), HOLD_MS + FADE_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (phase === "idle" || typeof document === "undefined") return null;

  return createPortal(
    <div
      aria-hidden
      // Portalled, and pointer-events-none while fading so a tap during the
      // hand-off reaches the app rather than dying on the splash.
      className={`fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-background transition-opacity duration-[420ms] ease-out ${
        phase === "out" ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <div
        aria-hidden
        className="animate-drift-slow pointer-events-none absolute top-1/2 left-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(163,230,53,0.13),transparent)] blur-3xl"
      />

      <div className="animate-switch-pop relative flex flex-col items-center">
        <span className="text-[2.6rem] leading-none font-extrabold tracking-[-0.04em]">
          Hypefy<span className="text-accent">.</span>
        </span>
      </div>

      <div className="absolute bottom-16 px-10">
        <p className="text-center text-[11px] font-bold tracking-[0.2em] text-faint uppercase">
          Did you know
        </p>
        <p className="animate-rise mt-2 max-w-[280px] text-center text-sm leading-relaxed text-muted">
          {fact}
        </p>
      </div>
    </div>,
    document.body
  );
}
