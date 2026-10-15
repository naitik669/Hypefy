"use client";

import type { ReactNode } from "react";
import { FlipIcon } from "@/components/ui/ShareIcon";

/**
 * The corner on everything set into the plate.
 *
 * A rounded rectangle, not a squircle. The superellipse the colour swatches
 * use bows its sides outward, which at this size reads as an app icon
 * stuck on the card rather than a picture set into it. A circular arc on
 * straight sides is quieter and sits with the plate's own 24px corner.
 */
export const WELL_RADIUS = 20;

/**
 * The card itself: a machined black plate, used by both faces.
 *
 * Nothing on it is a gradient and nothing on it is a texture. What makes
 * it read as an object rather than a dark rectangle is the edges alone: a
 * light hairline along the top inside edge and a dark one along the
 * bottom, which is how a milled plate catches a room light.
 *
 * A fine vertical brush was tried across the whole face. On a photograph
 * and behind small mono type it did not read as machining, it read as
 * banding on a bad screen — so the plate is flat and the edges do the work.
 *
 * The one piece of colour is the painted edge along the foot, and it takes
 * the owner's accent. They picked that colour once already; a card does not
 * need to ask a second time.
 */
export function CardPlate({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative flex h-full flex-col overflow-hidden rounded-[24px]"
      style={{
        background: "#0b0b0c",
        border: "1px solid rgba(255,255,255,0.09)",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -1px 0 rgba(0,0,0,0.8), 0 30px 70px -24px rgba(0,0,0,0.95)",
      }}
    >
      {children}
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-accent" />
    </div>
  );
}

/**
 * Anything set into the plate — the photograph, the code — sits in a well.
 *
 * Three layers: a hairline rim catching the light, a black groove, then
 * the thing itself. Nested rather than drawn with a box-shadow so the rim
 * follows the corner exactly at every radius, and so the groove reads as
 * depth rather than as a border.
 */
export function Well({ children, className = "" }: { children: ReactNode; className?: string }) {
  const r = WELL_RADIUS;
  return (
    <div
      className={className}
      style={{
        borderRadius: r,
        overflow: "hidden",
        background: "rgba(255,255,255,0.11)",
        padding: 2,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          borderRadius: r - 2,
          overflow: "hidden",
          background: "#000",
          padding: 1,
          display: "flex",
          flexDirection: "column",
          flex: 1,
        }}
      >
        <div
          style={{ borderRadius: r - 3, overflow: "hidden", display: "flex", flexDirection: "column", flex: 1 }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * The strip along the foot: what is on the other side, and the way there.
 *
 * Sharing is not here — it belongs beside the thing being shared, up with
 * the person. This row is only about the card having another side, which is
 * the one thing about it nobody would otherwise guess.
 */
export function PlateFoot({ side, onFlip }: { side: "front" | "back"; onFlip: () => void }) {
  return (
    <div
      className="relative mt-auto flex items-center gap-2 border-t border-white/[0.08] px-4 py-3"
      style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.045)" }}
    >
      <span className="font-mono text-[9.5px] font-bold uppercase tracking-[0.22em] text-white/55">
        {side === "front" ? "Hypefy ID" : "Profile"}
      </span>
      <button
        type="button"
        onClick={onFlip}
        className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-white/60 transition hover:bg-white/[0.06] active:scale-90"
      >
        <FlipIcon size={18} />
        <span className="sr-only">
          {side === "front" ? "Turn the card over to the Hypefy ID" : "Turn the card back to the profile"}
        </span>
      </button>
    </div>
  );
}
