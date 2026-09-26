"use client";

import { useEffect, useRef } from "react";
import { captionRuns } from "@/lib/caption-runs";

/** How fast a caption travels across the card, in px per second. */
const SPEED = 110;
/**
 * The share of one cycle spent moving, rather than waiting at one end or the
 * other. It has to match the percentages in `caption-sweep` (globals.css):
 * 26%→74% out and 88%→100% back, so a little under half.
 */
const TRAVEL_SHARE = 0.48;
/** However short or long the caption, a cycle stays inside these. */
const SHORTEST = 6;
const LONGEST = 18;

/**
 * A page's words where they lie over its photo.
 *
 * Two things happen here that a plain paragraph would not do.
 *
 * The shadow that keeps the words legible on a bright picture is carried by
 * the words only. Set on the whole line it also landed on the emoji, which
 * are already opaque colour — there it read as a grey smudge welded to the
 * glyph rather than as depth behind a letter.
 *
 * And the caption is one line. A long one used to wrap to three and then be
 * cut off mid-sentence, so the end was simply unreadable and three lines of
 * heavy type sat across the photo. Now it travels: left far enough to show
 * its end, a moment there, back, then a good rest on its opening words. The
 * distance is measured on the device rather than guessed from the character
 * count, because the guess is wrong for wide letters, for emoji, and for
 * every screen that is not the one the guess was tuned on.
 */
export function PageCaption({
  text,
  className = "",
  style,
  onClick,
}: {
  text: string;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLParagraphElement>(null);
  const size = style?.fontSize;

  useEffect(() => {
    const measure = () => {
      const b = box.current;
      const l = line.current;
      if (!b || !l) return;
      const over = l.scrollWidth - b.clientWidth;
      if (over <= 1) {
        // It fits. Nothing moves, and no fade at the edge implying it might.
        l.classList.remove("animate-caption-sweep");
        l.style.removeProperty("--caption-shift");
        l.style.removeProperty("--caption-secs");
        delete b.dataset.sweeping;
        return;
      }
      const secs = Math.min(LONGEST, Math.max(SHORTEST, over / SPEED / TRAVEL_SHARE));
      l.style.setProperty("--caption-shift", `${-over}px`);
      l.style.setProperty("--caption-secs", `${secs}s`);
      l.classList.add("animate-caption-sweep");
      b.dataset.sweeping = "true";
    };
    measure();
    // The card is resized by the deck as the window changes, and a font can
    // land after the first paint and make the same words wider.
    if (typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(measure);
    if (box.current) watch.observe(box.current);
    return () => watch.disconnect();
  }, [text, size]);

  return (
    <div ref={box} data-caption-box className="w-full overflow-hidden" onClick={onClick}>
      <p ref={line} className={`whitespace-nowrap will-change-transform ${className}`} style={style}>
        {captionRuns(text).map((run, i) =>
          run.emoji ? (
            <span key={i} className="[text-shadow:none]">
              {run.text}
            </span>
          ) : (
            run.text
          ),
        )}
      </p>
    </div>
  );
}
