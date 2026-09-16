"use client";

/**
 * Leaving a chat with the chat sliding away to the right, the inbox already
 * underneath it.
 *
 * Opening a chat slides through React's <ViewTransition> (the chat's
 * layout), because opening is a Link navigation, which React runs as a
 * transition. Going back is not: router.back() goes through the browser's
 * history, and nothing animates. So leaving runs its own view transition
 * around the back: the screen as it is (the chat) is the old picture, the
 * page back is the new one, and CSS slides the old one off
 * (html[data-dm-leave] in globals.css).
 */

/** A chat itself, not its info or media pages. */
export const CHAT_PATH = /^\/messages\/[0-9a-f-]{36}\/?$/;

/** Longest the slide waits for the page behind to be ready. */
const WAIT_MS = 1200;

type WithTransitions = Document & {
  startViewTransition?: (update: () => Promise<void>) => { finished: Promise<void> };
};

export function leaveChatAnimated(goBack: () => void): void {
  const doc = document as WithTransitions;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (!doc.startViewTransition || reduced) {
    goBack();
    return;
  }

  const from = location.pathname;
  const html = document.documentElement;
  html.dataset.dmLeave = "";
  const transition = doc.startViewTransition(
    () =>
      new Promise<void>((resolve) => {
        goBack();
        const began = performance.now();
        // Timers, not animation frames: the browser holds frames back while
        // a view transition is waiting for its update, so a frame-based wait
        // never finishes and the transition is abandoned.
        const check = () => {
          const left = location.pathname !== from && !document.querySelector("[data-chat-view]");
          if (left || performance.now() - began > WAIT_MS) {
            setTimeout(resolve, 16);
            return;
          }
          setTimeout(check, 16);
        };
        setTimeout(check, 0);
      }),
  );
  transition.finished.finally(() => {
    delete html.dataset.dmLeave;
  });
}
