"use client";

import { useFrameCatalog } from "@/components/ui/FrameCatalogProvider";
import { framePlacement, wearableFrame, FRAME_REACH, type FrameAsset } from "@/lib/frames";

/**
 * How far a frame may reach past the photo, as a share of the photo's size,
 * on every side. The photo is the 0–100 square of the drawing; frames draw
 * anywhere in −REACH…100+REACH.
 */
const REACH = FRAME_REACH * 100;

/** The frames still drawn by hand. Everything else comes from a file. */
const DRAWN = new Set(["deco-bolt"]);

type Props = {
  size: number;
  children: React.ReactNode;
  /**
   * Whose frame to draw. The tier is checked against this person's Premium,
   * so a lapsed plan quietly drops back to plain.
   */
  wearer?: { avatar_decoration?: string | null; is_premium?: boolean | null } | null;
  /**
   * A specific frame, whoever is underneath. For previews — the Marketplace
   * shows you what you would get, which is not the same question as what
   * you may wear.
   */
  id?: string | null;
};

/**
 * A decoration on an avatar: accents around it.
 *
 * The photo keeps its full size and the avatar keeps its exact place in the
 * layout: the frame is an overlay that is allowed to reach past the photo
 * (up to half its size on each side), the way decorations do on Discord.
 * Nothing around the avatar moves.
 *
 * Two kinds draw here. Bolt is a path in this file. Everything else is an
 * SVG an admin uploaded, drawn in an `<img>` and never inlined — an
 * uploaded SVG put straight into the DOM can carry script, and in an
 * `<img>` it cannot run. The cost is that an uploaded frame cannot pick up
 * `currentColor` or the theme, so the art has to carry its own colour.
 *
 * With neither a wearer nor an id it renders the avatar alone, so call
 * sites can pass whatever they have without a branch.
 */
export function AvatarFrame({ id, wearer, size, children }: Props) {
  const catalog = useFrameCatalog();
  // An explicit id wins and skips the tier check: that is what a preview is.
  const asset: FrameAsset | null = id
    ? (catalog[id] ?? { id, label: id, tier: "premium", url: null, scale: 1, offsetX: 0, offsetY: 0 })
    : wearableFrame(wearer, catalog);

  if (!asset) return <>{children}</>;

  if (asset.url) {
    const box = framePlacement(size, asset);
    return (
      <span className="relative inline-block shrink-0 align-middle" style={{ width: size, height: size }}>
        {children}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={asset.url}
          alt=""
          aria-hidden
          draggable={false}
          className="pointer-events-none absolute max-w-none select-none"
          style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
        />
      </span>
    );
  }

  if (!DRAWN.has(asset.id)) return <>{children}</>;

  const pad = (size * REACH) / 100;
  return (
    <span className="relative inline-block shrink-0 align-middle" style={{ width: size, height: size }}>
      {children}
      <svg
        aria-hidden
        viewBox={`${-REACH} ${-REACH} ${100 + 2 * REACH} ${100 + 2 * REACH}`}
        className="pointer-events-none absolute"
        style={{ left: -pad, top: -pad, width: size + 2 * pad, height: size + 2 * pad, overflow: "visible" }}
      >
        <Bolt />
      </svg>
    </span>
  );
}

/**
 * Bolt, the one frame still drawn in code.
 *
 * The other ten were retired: a catalogue nobody but a developer could add
 * to was the problem the uploader exists to solve, and keeping their
 * artwork here meant two ways of doing one thing. Their rows survive in
 * `products` as inactive, so anything that once referred to them still
 * resolves.
 */
function Bolt() {
  return (
    <path
      d="M104 -22 L84 12 L98 12 L86 40 L118 0 L102 0 L114 -22 Z"
      fill="#fde047"
      stroke="#713f12"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  );
}
