"use client";

import { packCover } from "@hypefy/core/sticker-packs";
import type { Sticker } from "@hypefy/core/stickers";
import { StickerImage } from "@/components/stickers/StickerImage";

/**
 * A pack's cover: up to three of its own stickers fanned out, the chosen one
 * in front (D4 C, "Packs & the drawer rail" board 2). Built from the pack —
 * there is no separate cover upload. Stickers are drawn level otherwise, so
 * the turn here is what makes it read as a pack rather than one sticker.
 */
export function PackCover({
  stickers,
  coverId,
  size = 92,
}: {
  stickers: readonly Sticker[];
  coverId: string | null;
  size?: number;
}) {
  const [front, left, right] = packCover(stickers, coverId);
  const inner = Math.round(size * 0.8);
  const box = { width: inner, height: inner };
  return (
    <span
      aria-hidden
      className="relative block shrink-0 overflow-hidden rounded-[22%] bg-[radial-gradient(120%_100%_at_50%_0%,#262626,#141414)]"
      style={{ width: size, height: size }}
    >
      {left && (
        <span className="absolute bottom-[4%] left-[2%]" style={{ transform: "rotate(-8deg)" }}>
          <StickerImage sticker={left} box={box} />
        </span>
      )}
      {right && (
        <span className="absolute bottom-[4%] right-[2%]" style={{ transform: "rotate(7deg)" }}>
          <StickerImage sticker={right} box={box} />
        </span>
      )}
      {front && (
        <span className="absolute bottom-[4%] left-1/2 z-[1]" style={{ transform: "translateX(-50%) rotate(-1deg)" }}>
          <StickerImage sticker={front} box={box} />
        </span>
      )}
    </span>
  );
}
