"use client";

import { stickerUrl, type Sticker } from "@hypefy/core/stickers";

/** The box a sticker is drawn in, in the thread (D2 B). */
export const STICKER_BOX = { width: 132, height: 150 } as const;

/**
 * The outline for a "stroke" sticker: four hard white offsets, no blur.
 *
 * It reads as the edge of a die-cut sticker, not as a shadow — there are
 * no drop shadows on stickers anywhere (Naitik, 27 Nov), and a blurred
 * offset would be one.
 */
export const STROKE_FILTER =
  "drop-shadow(3px 0 0 #fff) drop-shadow(-3px 0 0 #fff) drop-shadow(0 3px 0 #fff) drop-shadow(0 -3px 0 #fff)";

/** The size a sticker is drawn at inside a box, keeping its shape. */
export function fitInBox(s: { width: number; height: number }, box: { width: number; height: number }) {
  const k = Math.min(box.width / s.width, box.height / s.height);
  return { width: Math.round(s.width * k), height: Math.round(s.height * k) };
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

/**
 * One sticker, drawn as a picture with no bubble around it.
 *
 * `tilt` is degrees; the thread passes stickerTilt(message id) so a sticker
 * always sits the same way. The drawer passes nothing, so tiles stay level.
 */
export function StickerImage({
  sticker,
  box = STICKER_BOX,
  tilt = 0,
  className = "",
}: {
  sticker: Sticker;
  box?: { width: number; height: number };
  tilt?: number;
  className?: string;
}) {
  const size = fitInBox(sticker, box);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a public bucket file at its own size; next/image would re-encode it and lose nothing worth the round trip
    <img
      src={stickerUrl(SUPABASE_URL, sticker.path)}
      alt="Sticker"
      width={size.width}
      height={size.height}
      loading="lazy"
      decoding="async"
      draggable={false}
      className={`block select-none object-contain ${className}`}
      style={{
        width: size.width,
        height: size.height,
        transform: tilt ? `rotate(${tilt}deg)` : undefined,
        filter: sticker.edge === "stroke" ? STROKE_FILTER : undefined,
      }}
    />
  );
}
