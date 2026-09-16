"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

/** A chat, and anything inside one: these slide in instead (see the
 *  chat's layout), and a fade here would hide them for its first frames. */
const CHAT = /^\/messages\/[0-9a-f-]{36}(\/|$)/;

/**
 * Per-navigation wrapper for the signed-in app. Next.js re-mounts `template`
 * on every route change (unlike `layout`, which persists), so this plays a
 * subtle fade + rise as each page enters. The fixed bottom nav lives in the
 * layout above this, so it stays put while the page content animates in.
 *
 * Once the entrance finishes we DROP the animation class so the resting
 * element carries no transform. This matters: a CSS `transform` (even the
 * identity `matrix(1,0,0,1,0,0)` that a finished keyframe leaves behind)
 * establishes a containing block and would trap `position: fixed` sheets and
 * sticky CTAs rendered inside the page. Clearing the class avoids that.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [entering, setEntering] = useState(() => !CHAT.test(pathname));

  return (
    <div
      className={entering ? "animate-page-enter" : undefined}
      // Only react to THIS element's own animation, not child animations
      // (feed reveals, mascots, etc.) whose animationend events bubble up.
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget) setEntering(false);
      }}
    >
      {children}
    </div>
  );
}
