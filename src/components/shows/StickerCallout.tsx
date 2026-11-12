"use client";

import { useState, type ReactNode } from "react";
import type { Look } from "@/lib/show-looks";

/**
 * A sticker that goes somewhere, with a step in between.
 *
 * Mention, link, location and hashtag used to navigate on the first tap, and
 * the Show went with them — a stray thumb on somebody's name cost you the rest
 * of what you were watching, with no way back to it. A Show is twelve seconds
 * long; that is an expensive mis-tap.
 *
 * So the first tap names the destination and the second one goes. It also buys
 * somewhere to say what the sticker cannot: the person behind a handle, the
 * address behind a shortened link, how busy a tag is.
 *
 * The link inside is a real anchor, not a scripted push. These six stickers
 * navigated correctly before this and the point is to add a step, not to take
 * over the destination.
 */

/** Below this much of the frame, the callout opens upward instead. */
export const CALLOUT_FLIP_Y = 0.62;

export function StickerCallout({
  look,
  kind,
  title,
  sub,
  go,
  href,
  external = false,
  up = false,
  children,
}: {
  look: Look;
  /** The quiet word above the name: "Mention", "Place", "Link", "Tag". */
  kind: string;
  title: string;
  sub?: string;
  /** What the button says: "Open profile", "Open in Maps". */
  go: string;
  href: string;
  /** Off to another site, so it opens in a new tab and is marked up as such. */
  external?: boolean;
  /**
   * Open above the sticker rather than below it. Decided from the layer's own
   * `y` rather than by measuring: the position is already known, and reading
   * layout back to place something is a frame of work and a frame of jitter.
   */
  up?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ink = String(look.title.color ?? "#ffffff");

  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        aria-expanded={open}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          // The frame underneath takes a tap as "next Show".
          e.stopPropagation();
          setOpen((was) => !was);
        }}
        style={{
          display: "block",
          background: "none",
          border: "none",
          padding: 0,
          font: "inherit",
          color: "inherit",
          cursor: "pointer",
        }}
      >
        {children}
      </button>

      {open && (
        <>
          {/*
            While it is open, a tap anywhere closes it rather than advancing
            the Show. Without this the only way out of the callout would be
            to leave the Show, which is the thing it exists to prevent.
          */}
          <span
            aria-hidden
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
            style={{ position: "fixed", inset: 0, zIndex: 1 }}
          />
          <span
            role="dialog"
            aria-label={`${kind}: ${title}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
              ...(up ? { bottom: "calc(100% + 11px)" } : { top: "calc(100% + 11px)" }),
              zIndex: 2,
              width: 196,
              display: "flex",
              flexDirection: "column",
              gap: 3,
              padding: "11px 13px",
              borderRadius: 16,
              background: "rgba(12,12,12,0.9)",
              border: "1px solid rgba(255,255,255,0.18)",
              backdropFilter: "blur(12px)",
              boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
              textAlign: "left",
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: "0.09em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.52)",
              }}
            >
              {kind}
            </span>
            <span
              style={{
                fontSize: 13.5,
                fontWeight: 800,
                color: "#ffffff",
                overflowWrap: "anywhere",
              }}
            >
              {title}
            </span>
            {sub && (
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.68)", overflowWrap: "anywhere" }}>
                {sub}
              </span>
            )}
            <a
              href={href}
              {...(external ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}
              onClick={(e) => e.stopPropagation()}
              style={{
                marginTop: 7,
                borderRadius: 11,
                padding: "8px 10px",
                background: look.ink,
                color: ink === "#0a0a0a" ? "#ffffff" : "#0a0a0a",
                fontSize: 12,
                fontWeight: 800,
                textAlign: "center",
                textDecoration: "none",
              }}
            >
              {go}
            </a>
          </span>
        </>
      )}
    </span>
  );
}
