"use client";

import QRCode from "qrcode";
import { MARK_DOT, MARK_H, MARK_LETTER } from "@/lib/hypefy-mark";

/**
 * The Hypefy QR: the code for a profile, drawn rather than generated.
 *
 * The library hands back a matrix of light and dark squares and a picture
 * of the same thing; this takes the matrix and paints it, because the brand
 * is in how it is painted — modules nearly touching, eyes as rounded
 * squares, and the mark in a punched-out badge at the centre.
 *
 * Dark on light, which is the polarity the spec assumes and every scanner
 * ever written agrees on. A light-on-dark code was tried and looked better
 * against the card, but it is an inverted symbol: modern phone cameras cope
 * and a share of older single-purpose scanner apps flatly refuse, and a
 * code that does not scan is not a code. The tile is set into the plate's
 * own well so it reads as inlaid rather than stuck on.
 *
 * The badge is damage. It is covered by error correction level H, which
 * can lose about 30% of the code; the badge is held near 9% of the area so
 * there is room left for a scuffed screen and a bad angle.
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

export type QrPalette = {
  /** The field the code sits on. */
  field: string;
  /** The modules and the eyes. */
  module: string;
  /** The badge behind the mark, and the mark's own colour on it. */
  badge: string;
  badgeInk: string;
};

/** Black on white, with the badge in the same ink as the modules. */
export const QR_PALETTE: QrPalette = {
  field: "#ffffff",
  module: "#0a0a0a",
  badge: "#0a0a0a",
  badgeInk: "#ffffff",
};

/**
 * How much of its cell a module fills, and how round its corners are.
 *
 * Nearly the whole cell, barely rounded. Round dots with air between them
 * were tried first and read as decoration; a code is a grid, and the grid
 * is what makes it legible as one at a glance.
 */
const FILL = 0.94;
const ROUND = 0.22;

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
  palette: QrPalette = QR_PALETTE,
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

  ctx.fillStyle = palette.module;
  const inset = ((1 - FILL) / 2) * m;
  const modules = new Path2D();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!data[y * size + x]) continue;
      if (isFinderModule(x, y, size)) continue;
      if (isUnderBadge(x, y, size)) continue;
      box(modules, o + x * m + inset, o + y * m + inset, m * FILL, m * FILL, m * ROUND);
    }
  }
  ctx.fill(modules);

  // The three eyes, drawn as rings rather than module by module. A finder
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
    box(eyes, x, y, s, s, m * 1.9);
    // Cut the middle back out with the even-odd rule, then fill the pupil.
    box(eyes, x + m, y + m, s - m * 2, s - m * 2, m * 1.3);
    box(eyes, x + m * 2, y + m * 2, s - m * 4, s - m * 4, m * 0.85);
  }
  ctx.fill(eyes, "evenodd");

  paintBadge(ctx, o, m, size, palette);
  ctx.restore();
}

/** The badge and the mark inside it, where the modules were cleared. */
function paintBadge(
  ctx: CanvasRenderingContext2D,
  o: number,
  m: number,
  size: number,
  palette: QrPalette,
): void {
  const { from, to } = badgeSpan(size);
  const x = o + from * m;
  const y = o + from * m;
  const side = (to - from + 1) * m;

  const badge = new Path2D();
  box(badge, x, y, side, side, side * 0.26);
  ctx.fillStyle = palette.badge;
  ctx.fill(badge);

  /*
   * The mark, centred on the H.
   *
   * Not on the lockup: the full stop pulls the lockup's box three units
   * right, so centring that puts the letter visibly left of middle. The eye
   * reads the H as the object and the dot as punctuation hanging off it.
   * The H is centred and the dot sits in the right-hand margin, which is
   * why the margins here are not equal.
   */
  const hWidth = side * 0.52;
  const k = hWidth / MARK_H.w;
  ctx.save();
  ctx.translate(x + (side - hWidth) / 2, y + (side - MARK_H.h * k) / 2 - MARK_H.y * k);
  ctx.scale(k, k);
  ctx.fillStyle = palette.badgeInk;
  for (const r of MARK_LETTER) ctx.fillRect(r.x, r.y, r.w, r.h);
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
