"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Reveals its children with a fade + rise the first time they scroll into
 * view (via IntersectionObserver). Elements already on screen at mount reveal
 * immediately, producing a gentle cascade on first paint. The motion itself
 * lives in the `.reveal-up` / `.is-visible` CSS (globals.css), which also
 * collapses to an instant show under `prefers-reduced-motion`.
 *
 * `delay` staggers neighbouring items; keep it small and capped by the caller.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // No IO (very old browser / SSR hydration edge): just show.
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.04 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal-up ${visible ? "is-visible" : ""}${className ? ` ${className}` : ""}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
