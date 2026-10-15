import { canShow, type Tier } from "@/lib/cosmetics";

/**
 * Avatar frames that come from a file rather than from code.
 *
 * Every other cosmetic in the app is drawn by hand in a component. A frame
 * may now instead be an SVG someone uploaded through the admin panel, with
 * three numbers saying how it sits over the avatar — because an export that
 * is a few percent off should be nudged, not sent back to Figma.
 *
 * The catalogue holds both kinds. A code-drawn frame is simply one with no
 * url, and everything downstream treats them the same: one registry, one
 * tier check, one place to ask whether somebody may wear a thing.
 */

export type FrameAsset = {
  id: string;
  label: string;
  tier: Tier;
  /** Public URL of the artwork. Null for the frames still drawn in code. */
  url: string | null;
  /** Size as a multiple of the default, which already spans twice the avatar. */
  scale: number;
  /** Offset from centre, in avatar widths. */
  offsetX: number;
  offsetY: number;
  /** Degrees clockwise, about the art's own centre. */
  rotation: number;
};

export type FrameCatalog = Record<string, FrameAsset>;

/**
 * How far a frame may reach past the photo, as a share of the photo's size,
 * on every side.
 *
 * Shared with AvatarFrame's own viewBox, where the photo is the 0–100 box
 * of a -50…150 square. An uploaded file is laid out in exactly that space,
 * so a hand-drawn frame and an uploaded one are placed by one rule.
 */
export const FRAME_REACH = 0.5;

/**
 * Where to put the artwork over an avatar of this size.
 *
 * At rest the art spans twice the avatar and is centred on it, which is the
 * same square the code-drawn frames use. Scale grows it about that centre;
 * the offsets move it, measured in avatar widths so a frame placed once
 * looks the same at 24px in a comment and at 150px on a profile.
 */
export function framePlacement(
  size: number,
  asset: Pick<FrameAsset, "scale" | "offsetX" | "offsetY"> & { rotation?: number },
): { width: number; height: number; left: number; top: number; transform?: string } {
  const span = size * (1 + 2 * FRAME_REACH) * asset.scale;
  return {
    width: span,
    height: span,
    left: size / 2 - span / 2 + asset.offsetX * size,
    top: size / 2 - span / 2 + asset.offsetY * size,
    // About the art's own centre, which is where the box already is, so
    // rotation composes with the other two without touching them.
    transform: asset.rotation ? `rotate(${asset.rotation}deg)` : undefined,
  };
}

/** The public URL of an uploaded frame, from its storage path. */
export function frameUrl(supabaseUrl: string, path: string): string {
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/cosmetics/${path}`;
}

/**
 * The frame this person may wear right now, if any.
 *
 * Mirrors ownership the way the rest of the cosmetics do: a Premium frame
 * shows while its wearer has Premium, so a lapsed plan quietly drops back
 * to plain. An id that is not in the catalogue — retired, or never there —
 * draws nothing rather than a gap.
 */
export function wearableFrame(
  wearer: { avatar_decoration?: string | null; is_premium?: boolean | null } | null | undefined,
  catalog: FrameCatalog,
): FrameAsset | null {
  const id = wearer?.avatar_decoration;
  if (!id) return null;
  const asset = catalog[id];
  if (!asset) return null;
  return canShow(asset.tier, !!wearer?.is_premium) ? asset : null;
}
