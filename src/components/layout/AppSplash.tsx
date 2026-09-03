"use client";

import { useEffect } from "react";

/**
 * Retires the opening splash.
 *
 * The splash itself is server-rendered in the root layout, not here — it has
 * to be in the first HTML to paint before hydration and before the app
 * shell's auth and profile queries resolve. Mounted inside the (app) layout
 * it could only appear AFTER all of that, which is the opposite of a splash.
 *
 * So this component renders nothing. It flips one attribute on <html> and
 * lets CSS do the fade, which means React renders the splash markup once and
 * never has to touch it again: no DOM removal, no hydration mismatch.
 *
 * SPLASH_HOLD_MS/FADE must match the transition in globals.css.
 */
const HOLD_MS = 1250;
const FADE_MS = 420;

export function AppSplash() {
  useEffect(() => {
    const root = document.documentElement;
    // The inline script already ruled it out — nothing was ever painted.
    if (root.dataset.splash === "off") return;

    const t1 = setTimeout(() => {
      root.dataset.splash = "done";
    }, HOLD_MS);
    // display:none once faded, so it cannot swallow a tap on the app beneath.
    const t2 = setTimeout(() => {
      root.dataset.splash = "off";
    }, HOLD_MS + FADE_MS);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return null;
}
