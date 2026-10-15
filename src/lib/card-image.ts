"use client";

import { paintHypefyQr } from "@/lib/hypefy-qr";
import { WELL_RADIUS } from "@/components/profile/CardPlate";
import { pronounLabel } from "@/lib/profile";
import { anthemLine, memberNumber, memberSince, prettyUrl } from "@/lib/profile-card";
import { remarkFor } from "@/lib/card-remarks";

/**
 * The Hypefy ID, drawn as a picture you can keep.
 *
 * Painted rather than screenshotted. The obvious route is to rasterise the
 * DOM, which means a library, a second layout engine and a set of rules
 * about which CSS survives; this draws the same design directly, which is
 * more code here and no new dependency, and it means the saved image is a
 * fixed size at a fixed density however the card happened to be laid out
 * on the screen it was saved from.
 *
 * The cost is that this file and HypefyIdFace are a pair: a change to one
 * is a change to both. What keeps them honest is that everything with
 * meaning — the mark, the code, the member number, the line about the
 * person — comes from the same modules, so what can drift is spacing, not
 * identity.
 */

/** The design is laid out at this width and scaled up on the way out. */
const W = 380;
const SCALE = 3;

type IdCardInput = {
  name: string;
  username: string | null;
  userId: string;
  url: string;
  joinedAt?: string | null;
  memberNo?: number | null;
  interests?: string[];
  tags: string[];
  anthem?: unknown;
  pronouns?: string | null;
  verified: boolean;
  /** The painted edge. The owner's accent, resolved by the caller. */
  accent?: string;
};

const PAD = 16;
const QR = 196;
/** The well: a 2px rim and a 1px groove around whatever sits in it. */
const WELL = 3;
const QR_BOX = QR + 2 * 14 + 2 * WELL;
const ROW = 23;

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
  name: number;
  handle: number;
  rulesTop: number;
  rowHeight: number;
  footer: number;
} {
  const header = PAD + 12;
  const qrTop = header + 14;
  const name = qrTop + QR_BOX + 38;
  const handle = name + 17;
  const rulesTop = handle + 14;
  const footer = rulesTop + rows * ROW + 36;
  return { width: W, height: footer + 18, header, qrTop, name, handle, rulesTop, rowHeight: ROW, footer };
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
  const no = memberNumber(input.memberNo);
  const since = memberSince(input.joinedAt);
  const anthem = anthemLine(input.anthem);
  const pronouns = pronounLabel(input.pronouns);
  const remark = remarkFor({
    userId: input.userId,
    tags: input.tags,
    interests: input.interests ?? [],
    hasAnthem: !!anthem,
    memberNo: input.memberNo ?? null,
  });
  const entries: [string, string, "plain" | "strong" | "lower"][] = [];
  if (no) entries.push(["MEMBER", no.split("").join(" "), "strong"]);
  if (since) entries.push(["SINCE", since, "plain"]);
  if (pronouns) entries.push(["PRONOUNS", pronouns, "plain"]);
  if (input.tags.length > 0) entries.push(["ROLES", input.tags.join(" · ").toUpperCase(), "plain"]);
  entries.push(["REMARKS", remark, "lower"]);
  if (anthem) entries.push(["ANTHEM", anthem, "plain"]);

  const L = idCardLayout(entries.length);
  const f = families();
  const accent = input.accent ?? "#a3e635";

  const canvas = document.createElement("canvas");
  canvas.width = L.width * SCALE;
  canvas.height = L.height * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.scale(SCALE, SCALE);

  // The plate, clipped to its own corners.
  roundRect(ctx, 0, 0, L.width, L.height, 24);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = "#0b0b0c";
  ctx.fillRect(0, 0, L.width, L.height);

  // The edges that make it a plate rather than a rectangle.
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.fillRect(0, 0, L.width, 1);
  ctx.fillStyle = "rgba(0,0,0,0.8)";
  ctx.fillRect(0, L.height - 4, L.width, 1);
  // The painted edge.
  ctx.fillStyle = accent;
  ctx.fillRect(0, L.height - 3, L.width, 3);

  const left = PAD;
  const right = L.width - PAD;
  ctx.textBaseline = "alphabetic";

  // Header: the words alone, at the right.
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = `700 10px ${f.mono}`;
  tracked(ctx, "HYPEFY ID", right, L.header, 2, "right");

  // The code, in the same well the photograph sits in on the front: a
  // light rim, a black groove, then the tile.
  const qrX = (L.width - QR_BOX) / 2;
  roundRect(ctx, qrX, L.qrTop, QR_BOX, QR_BOX, WELL_RADIUS);
  ctx.fillStyle = "rgba(255,255,255,0.11)";
  ctx.fill();
  roundRect(ctx, qrX + 2, L.qrTop + 2, QR_BOX - 4, QR_BOX - 4, WELL_RADIUS - 2);
  ctx.fillStyle = "#000000";
  ctx.fill();
  roundRect(ctx, qrX + WELL, L.qrTop + WELL, QR_BOX - WELL * 2, QR_BOX - WELL * 2, WELL_RADIUS - 3);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(qrX, L.qrTop, QR_BOX, QR_BOX);
  ctx.translate(qrX + WELL + 14, L.qrTop + WELL + 14);
  paintHypefyQr(ctx, input.url, QR);
  ctx.restore();

  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font = `400 9px ${f.mono}`;
  {
    const cap = "SCAN TO OPEN";
    const w = [...cap].reduce((n, c) => n + ctx.measureText(c).width + 2.2, 0) - 2.2;
    tracked(ctx, cap, (L.width - w) / 2, L.qrTop + QR_BOX + 14, 2.2);
  }

  // Who
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 19px ${f.sans}`;
  ctx.fillText(clip(ctx, input.name, right - left), left, L.name);
  if (input.username) {
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = `400 11.5px ${f.mono}`;
    ctx.fillText(`@${input.username}`, left, L.handle);
  }

  // The record, each row under its own rule.
  const rule = (y: number) => {
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.fillRect(left, y, right - left, 1);
  };
  rule(L.rulesTop);
  entries.forEach(([label, value, kind], i) => {
    const y = L.rulesTop + ROW * i + 16;
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = `400 9px ${f.mono}`;
    tracked(ctx, label, left, y, 1.4);
    if (kind === "strong") {
      ctx.fillStyle = "#ffffff";
      ctx.font = `700 13px ${f.mono}`;
    } else if (kind === "lower") {
      // The one line in the person's voice rather than the document's.
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.font = `600 11.5px ${f.mono}`;
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = `600 11.5px ${f.mono}`;
    }
    ctx.fillText(clip(ctx, value, right - left - 66), left + 66, y);
    rule(L.rulesTop + ROW * (i + 1));
  });

  // The wordmark, and the address so the card still says where it goes if
  // the code will not scan.
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.font = `400 9.5px ${f.mono}`;
  ctx.fillText(prettyUrl(input.url), left, L.footer);
  ctx.font = `800 15px ${f.sans}`;
  const mark = "Hypefy";
  const dotW = ctx.measureText(".").width;
  const markW = ctx.measureText(mark).width + dotW;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText(mark, right - markW, L.footer + 1);
  ctx.fillStyle = accent;
  ctx.fillText(".", right - dotW, L.footer + 1);

  ctx.restore();
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
