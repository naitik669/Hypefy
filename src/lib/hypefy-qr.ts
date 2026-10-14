"use client";

import QRCode from "qrcode";
import { MARK_BOX, MARK_DOT, MARK_LETTER } from "@/lib/hypefy-mark";

/**
 * The Hypefy QR: the code for a profile, drawn rather than generated.
 *
 * The library hands back a matrix of light and dark squares and a picture of
 * the same thing; this takes the matrix and paints it, because the brand is
 * in how it is painted — rounded modules, rounded eyes, a gradient through
 * the dark, and the mark sitting in a punched-out badge at the centre.
 *
 * Two constraints are not negotiable and shape everything below.
 *
 * First, a scanner thresholds on brightness, so the dark modules have to be
 * genuinely dark on a genuinely light field. Lime (#a3e635) is a light
 * colour: bright lime modules on black is an inverted code at about 2:1, and
 * a good share of scanners simply decline it. So the gradient runs through
 * the dark greens — lime-700 down to near-black — which still reads as green
 * at a glance, and the bright lime is spent on the badge and the frame
 * around the code, where it costs nothing.
 *
 * Second, the badge is damage. It is covered by error correction level H,
 * which can lose about 30% of the code; the badge is held near 9% of the
 * area so there is room left for a scuffed screen and a bad angle.
 */

/** A finder pattern — the big square in three corners — is 7 modules across. */
const FINDER = 7;
/** The badge's side, as a share of the code's width. Well inside what H recovers. */
const BADGE_SHARE = 0.3;
/** Light modules kept clear around the whole code, in modules. */
const QUIET = 3;

/** Whether a module belongs to one of the three corner finder patterns. */
export function isFinderModule(x: number, y: number, size: number): boolean {
  const left = x < FINDER;
  const right = x >= size - FINDER;
  const top = y < FINDER;
  const bottom = y >= size - FINDER;
  // Three corners, never the fourth — the bottom right carries data.
  return (left && top) || (right && top) || (left && bottom);
}

/**
 * The module indices the centre badge covers, inclusive at both ends.
 *
 * Always an odd span so it sits dead centre however big the code is — an
 * even one lands half a module off and the badge looks crooked next to the
 * grid it is punched out of.
 */
export function badgeSpan(size: number): { from: number; to: number } {
  let span = Math.round(size * BADGE_SHARE);
  if (span % 2 !== size % 2) span += 1;
  const from = Math.floor((size - span) / 2);
  return { from, to: from + span - 1 };
}

export function isUnderBadge(x: number, y: number, size: number): boolean {
  const { from, to } = badgeSpan(size);
  return x >= from && x <= to && y >= from && y <= to;
}

/* ── Drawing ─────────────────────────────────────────────────────────────── */

/** roundRect is everywhere we ship, but a square module is a fine degradation. */
function box(path: Path2D, x: number, y: number, w: number, h: number, r: number) {
  if (typeof path.roundRect === "function") path.roundRect(x, y, w, h, r);
  else path.rect(x, y, w, h);
}

type Palette = {
  /** The light field the code sits on. */
  field: string;
  /** The dark modules, from the top-left corner to the bottom-right. */
  from: string;
  mid: string;
  to: string;
  /** The badge behind the mark. */
  badgeFrom: string;
  badgeTo: string;
};

export const QR_PALETTE: Palette = {
  field: "#ffffff",
  from: "#4d7c0f",
  mid: "#2d5209",
  to: "#16320a",
  badgeFrom: "#bef264",
  badgeTo: "#65a30d",
};

/**
 * Paint a Hypefy QR onto a canvas context, filling a px × px square whose
 * top-left corner is at (0, 0) of the current transform.
 *
 * Separated from the data-URL helper so the card exporter can draw the code
 * straight into the card it is already painting, at whatever size and
 * position it has room for, rather than round-tripping through an image.
 */
export function paintHypefyQr(
  ctx: CanvasRenderingContext2D,
  url: string,
  px: number,
  palette: Palette = QR_PALETTE,
): void {
  const qr = QRCode.create(url, { errorCorrectionLevel: "H" });
  const size = qr.modules.size;
  const data = qr.modules.data;
  // The quiet zone is part of the code, not padding round it: scanners need
  // the light border to find the edges at all.
  const m = px / (size + QUIET * 2);
  const o = QUIET * m;

  ctx.save();
  ctx.fillStyle = palette.field;
  const field = new Path2D();
  box(field, 0, 0, px, px, px * 0.07);
  ctx.fill(field);

  const dark = ctx.createLinearGradient(o, o, o + size * m, o + size * m);
  dark.addColorStop(0, palette.from);
  dark.addColorStop(0.45, palette.mid);
  dark.addColorStop(1, palette.to);
  ctx.fillStyle = dark;

  // Every ordinary module in one path, filled once, so the gradient runs
  // across the code rather than restarting inside each square.
  const modules = new Path2D();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!data[y * size + x]) continue;
      if (isFinderModule(x, y, size)) continue;
      if (isUnderBadge(x, y, size)) continue;
      // Inset slightly: touching modules read as a solid blob, and the gap
      // is what makes a dotted code look drawn rather than pixelated.
      box(modules, o + x * m + m * 0.08, o + y * m + m * 0.08, m * 0.84, m * 0.84, m * 0.3);
    }
  }
  ctx.fill(modules);

  // The three eyes, drawn as rings rather than module-by-module. A finder
  // pattern is a fixed shape in every code, so it can be a shape.
  const eyes = new Path2D();
  for (const [cx, cy] of [
    [0, 0],
    [size - FINDER, 0],
    [0, size - FINDER],
  ]) {
    const x = o + cx * m;
    const y = o + cy * m;
    const s = FINDER * m;
    box(eyes, x, y, s, s, m * 2);
    // Cut the middle back out with the opposite winding, then fill the pupil.
    box(eyes, x + m, y + m, s - m * 2, s - m * 2, m * 1.4);
    box(eyes, x + m * 2, y + m * 2, s - m * 4, s - m * 4, m * 0.9);
  }
  ctx.fill(eyes, "evenodd");

  paintBadge(ctx, o, m, size, palette);
  ctx.restore();
}

/** The lime badge and the mark inside it, where the modules were cleared. */
function paintBadge(
  ctx: CanvasRenderingContext2D,
  o: number,
  m: number,
  size: number,
  palette: Palette,
): void {
  const { from, to } = badgeSpan(size);
  const x = o + from * m;
  const y = o + from * m;
  const side = (to - from + 1) * m;

  const badge = new Path2D();
  box(badge, x, y, side, side, side * 0.28);
  const lime = ctx.createLinearGradient(x, y, x + side, y + side);
  lime.addColorStop(0, palette.badgeFrom);
  lime.addColorStop(1, palette.badgeTo);
  ctx.fillStyle = lime;
  ctx.fill(badge);

  // The mark, scaled from its 24-unit box into the badge with a margin.
  const inset = side * 0.14;
  const scale = (side - inset * 2) / MARK_BOX;
  ctx.save();
  ctx.translate(x + inset, y + inset);
  ctx.scale(scale, scale);
  ctx.fillStyle = "#0a0a0a";
  for (const r of MARK_LETTER) ctx.fillRect(r.x, r.y, r.w, r.h);
  // On lime, the full stop reads as a hole rather than a dot unless it is
  // darker still than the letter.
  ctx.fillStyle = "#1a2e05";
  ctx.fillRect(MARK_DOT.x, MARK_DOT.y, MARK_DOT.w, MARK_DOT.h);
  ctx.restore();
}

/** The same code as a PNG data URL, for an `<img>`. */
export function hypefyQrDataUrl(url: string, px = 640): string | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = px;
    canvas.height = px;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    paintHypefyQr(ctx, url, px);
    return canvas.toDataURL("image/png");
  } catch {
    // A code that cannot be drawn is not an error worth surfacing: the
    // address is printed beside it and says the same thing.
    return null;
  }
}
