"use client";

import { paintHypefyQr } from "@/lib/hypefy-qr";
import { MARK_BOX, MARK_DOT, MARK_LETTER } from "@/lib/hypefy-mark";
import {
  CARD_INK,
  cardTheme,
  hypefyId,
  memberSince,
  prettyUrl,
  type CardTheme,
} from "@/lib/profile-card";

/**
 * The Hypefy ID, drawn as a picture you can keep.
 *
 * Painted rather than screenshotted. The obvious route is to rasterise the
 * DOM, which means a library, a second layout engine and a set of rules
 * about which CSS survives; this draws the same design directly, which is
 * more code here and no new dependency, and it means the saved image is a
 * fixed size at a fixed density however the card happened to be laid out on
 * the screen it was saved from.
 *
 * The cost is that this file and HypefyIdFace are a pair: a change to one
 * is a change to both. They are kept honest by sharing the theme, the mark
 * and the QR painter, so what can drift is spacing, not identity.
 */

/** The design is laid out at this width and scaled up on the way out. */
const W = 380;
const SCALE = 3;

type IdCardInput = {
  name: string;
  username: string | null;
  userId: string;
  url: string;
  themeId?: string | null;
  joinedAt?: string | null;
  verified: boolean;
  followers: number;
  posts: number;
};

/* ── Layout ──────────────────────────────────────────────────────────────── */

const PAD = 10; // the card's own frame
const INNER = 16; // the panel's padding
const QR = 186;
const QR_FRAME = QR + 2 * 10 + 2 * 2; // white padding, then the lime hairline

/**
 * Where everything sits, as a plain object.
 *
 * Worked out before anything is drawn because a canvas has to be sized
 * before it can be painted, and because a layout you can read is a layout
 * you can check without looking at a picture.
 */
export function idCardLayout(rows: number): {
  width: number;
  height: number;
  header: number;
  qrTop: number;
  caption: number;
  name: number;
  handle: number;
  rulesTop: number;
  rowHeight: number;
  footer: number;
} {
  const header = PAD + INNER + 14;
  const qrTop = header + 12 + 16;
  const caption = qrTop + QR_FRAME + 18;
  const name = caption + 26;
  const handle = name + 18;
  const rulesTop = handle + 18;
  const rowHeight = 26;
  const footer = rulesTop + rows * rowHeight + 2 + 24;
  return {
    width: W,
    height: footer + 12 + INNER + PAD,
    header,
    qrTop,
    caption,
    name,
    handle,
    rulesTop,
    rowHeight,
    footer,
  };
}

/* ── Painting ────────────────────────────────────────────────────────────── */

/** The app's own type, when the document can tell us; a plain stack otherwise. */
function families(): { sans: string; mono: string } {
  try {
    const s = getComputedStyle(document.body);
    return {
      sans: s.fontFamily || "system-ui, sans-serif",
      mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
    };
  } catch {
    return { sans: "system-ui, sans-serif", mono: "monospace" };
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

/** The theme's background: the same two blooms over the same ink ramp as the CSS. */
function paintBackground(ctx: CanvasRenderingContext2D, theme: CardTheme, w: number, h: number) {
  const ink = ctx.createLinearGradient(0, 0, 0, h);
  ink.addColorStop(0, CARD_INK[0]);
  ink.addColorStop(0.62, CARD_INK[1]);
  ink.addColorStop(1, CARD_INK[2]);
  ctx.fillStyle = ink;
  ctx.fillRect(0, 0, w, h);

  const bloom = ctx.createRadialGradient(w * 0.06, h * 0.86, 0, w * 0.06, h * 0.86, w * 1.18);
  bloom.addColorStop(0, `rgba(${theme.bloom.join(",")},0.42)`);
  bloom.addColorStop(0.62, "rgba(0,0,0,0)");
  ctx.fillStyle = bloom;
  ctx.fillRect(0, 0, w, h);

  const counter = ctx.createRadialGradient(w * 1.04, -h * 0.06, 0, w * 1.04, -h * 0.06, w * 0.86);
  counter.addColorStop(0, `rgba(${theme.counter.join(",")},0.3)`);
  counter.addColorStop(0.6, "rgba(0,0,0,0)");
  ctx.fillStyle = counter;
  ctx.fillRect(0, 0, w, h);
}

function paintMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const k = size / MARK_BOX;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.fillStyle = "#ffffff";
  for (const r of MARK_LETTER) ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = "#a3e635";
  ctx.fillRect(MARK_DOT.x, MARK_DOT.y, MARK_DOT.w, MARK_DOT.h);
  ctx.restore();
}

/** Monospaced small caps with the letter-spacing the DOM uses. */
function tracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
  align: "left" | "right" = "left",
) {
  const chars = [...text];
  const width = chars.reduce((n, c) => n + ctx.measureText(c).width + spacing, 0) - spacing;
  let cursor = align === "right" ? x - width : x;
  for (const c of chars) {
    ctx.fillText(c, cursor, y);
    cursor += ctx.measureText(c).width + spacing;
  }
  return width;
}

/** Draw the ID onto a canvas, sized to fit. Returns the canvas. */
export function drawHypefyId(input: IdCardInput): HTMLCanvasElement {
  const theme = cardTheme(input.themeId);
  const since = memberSince(input.joinedAt);
  const rows = since ? 3 : 2;
  const L = idCardLayout(rows);
  const f = families();

  const canvas = document.createElement("canvas");
  canvas.width = L.width * SCALE;
  canvas.height = L.height * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.scale(SCALE, SCALE);

  // The card, clipped to its own corners so the background does not square
  // off the rounding.
  roundRect(ctx, 0, 0, L.width, L.height, 28);
  ctx.save();
  ctx.clip();
  paintBackground(ctx, theme, L.width, L.height);
  ctx.restore();

  // The panel the contents sit on.
  roundRect(ctx, PAD, PAD, L.width - PAD * 2, L.height - PAD * 2, 20);
  const panel = ctx.createLinearGradient(0, PAD, 0, L.height - PAD);
  panel.addColorStop(0, "rgba(0,0,0,0.42)");
  panel.addColorStop(1, "rgba(0,0,0,0.12)");
  ctx.fillStyle = panel;
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 1;
  ctx.stroke();

  const left = PAD + INNER;
  const right = L.width - PAD - INNER;

  // Header
  paintMark(ctx, left, L.header - 14, 19);
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = `700 11px ${f.mono}`;
  tracked(ctx, "HYPEFY ID", left + 27, L.header + 1, 2);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font = `400 10px ${f.mono}`;
  tracked(ctx, input.verified ? "VERIFIED" : "MEMBER", right, L.header + 1, 1.4, "right");

  // The code, in its lime hairline on white.
  const qrX = (L.width - QR_FRAME) / 2;
  const lime = ctx.createLinearGradient(qrX, L.qrTop, qrX + QR_FRAME, L.qrTop + QR_FRAME);
  lime.addColorStop(0, "rgba(190,242,100,0.9)");
  lime.addColorStop(1, "rgba(101,163,13,0.35)");
  roundRect(ctx, qrX, L.qrTop, QR_FRAME, QR_FRAME, 22);
  ctx.fillStyle = lime;
  ctx.fill();
  roundRect(ctx, qrX + 2, L.qrTop + 2, QR_FRAME - 4, QR_FRAME - 4, 21);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.save();
  ctx.translate(qrX + 12, L.qrTop + 12);
  paintHypefyQr(ctx, input.url, QR);
  ctx.restore();

  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.font = `400 10px ${f.mono}`;
  ctx.save();
  ctx.textAlign = "left";
  const capWidth = [..."SCAN TO OPEN"].reduce((n, c) => n + ctx.measureText(c).width + 2.2, 0) - 2.2;
  tracked(ctx, "SCAN TO OPEN", (L.width - capWidth) / 2, L.caption, 2.2);
  ctx.restore();

  // Who
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 20px ${f.sans}`;
  // The seal is not drawn beside the name here the way it is on screen —
  // the header already says VERIFIED, and a second mark in a picture that
  // leaves the app is a claim with nothing behind it.
  ctx.fillText(clip(ctx, input.name, right - left), left, L.name);
  if (input.username) {
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = `400 12px ${f.mono}`;
    ctx.fillText(`@${input.username}`, left, L.handle);
  }

  // The rows, between two hairlines.
  const rule = (y: number) => {
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
  };
  rule(L.rulesTop);
  const entries: [string, string][] = [["ID", hypefyId(input.userId)]];
  if (since) entries.push(["SINCE", since.toUpperCase()]);
  entries.push([
    "STANDING",
    `${input.followers.toLocaleString()} FOLLOWERS · ${input.posts.toLocaleString()} POSTS`,
  ]);
  entries.forEach(([label, value], i) => {
    const y = L.rulesTop + L.rowHeight * i + 18;
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = `400 10px ${f.mono}`;
    tracked(ctx, label, left, y, 1.4);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = `600 12px ${f.mono}`;
    ctx.fillText(clip(ctx, value, right - left - 74), left + 74, y);
  });
  rule(L.rulesTop + entries.length * L.rowHeight + 2);

  // The address, so the card still says where it goes if the code will not scan.
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.font = `400 10px ${f.mono}`;
  const addr = prettyUrl(input.url);
  ctx.fillText(addr, (L.width - ctx.measureText(addr).width) / 2, L.footer);

  return canvas;
}

/** Trim to fit, with an ellipsis, rather than running off the card. */
function clip(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > max) out = out.slice(0, -1);
  return `${out}…`;
}

/* ── Saving ──────────────────────────────────────────────────────────────── */

export type SaveResult = "shared" | "downloaded" | "failed";

/**
 * Hand the picture to the person.
 *
 * On a phone this goes through the share sheet, which is where "Save image"
 * lives on both Android and iOS — writing straight to the gallery would
 * mean a native plugin and a store build, and the sheet also covers sending
 * it to someone, which is the other thing people do with it. On a desktop
 * browser there is no sheet, so it downloads.
 */
export async function saveHypefyId(input: IdCardInput): Promise<SaveResult> {
  let blob: Blob | null = null;
  try {
    const canvas = drawHypefyId(input);
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  } catch {
    return "failed";
  }
  if (!blob) return "failed";

  const file = new File([blob], `hypefy-id-${input.username ?? "card"}.png`, { type: "image/png" });

  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `${input.name} on Hypefy` });
      return "shared";
    } catch {
      // Dismissed, or the sheet refused the file. Fall through to a download
      // rather than reporting a failure the person caused.
    }
  }

  try {
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
    return "downloaded";
  } catch {
    return "failed";
  }
}
