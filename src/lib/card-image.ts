"use client";

import { paintHypefyQr } from "@/lib/hypefy-qr";
import { WELL_RADIUS } from "@/components/profile/CardPlate";
import { nameStyle } from "@/lib/cosmetics";
import { pronounLabel } from "@/lib/profile";
import { anthemLine, memberNumber, memberSince, prettyUrl } from "@/lib/profile-card";
import { remarkRows } from "@/lib/card-remarks";

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
  /** The front needs the person as well as the record. */
  avatarUrl?: string | null;
  hue?: number;
  bio?: string | null;
  cosmetics?: { is_premium?: boolean | null; name_font?: string | null; name_glow?: string | null } | null;
  stats?: { posts: number; followers: number };
  /** What REMARKS reads them by. Optional; see card-remarks. */
  posts?: number;
  hypers?: number;
  lastSeenAt?: string | null;
  showActivity?: boolean;
  frame?: string | null;
  isPremium?: boolean;
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
  // The same rows the screen draws, from the same function, so a saved
  // card and the card it was saved from cannot disagree.
  const remark = remarkRows({
    userId: input.userId,
    tags: input.tags,
    interests: input.interests ?? [],
    hasAnthem: !!anthem,
    memberNo: input.memberNo ?? null,
    joinedAt: input.joinedAt ?? null,
    posts: input.posts,
    hypers: input.hypers,
    lastSeenAt: input.lastSeenAt ?? null,
    showActivity: input.showActivity,
    frame: input.frame ?? null,
    isPremium: input.isPremium,
    verified: input.verified,
  });
  const entries: [string, string, "plain" | "strong" | "lower"][] = [];
  if (no) entries.push(["MEMBER", no.split("").join(" "), "strong"]);
  if (since) entries.push(["SINCE", since, "plain"]);
  if (pronouns) entries.push(["PRONOUNS", pronouns, "plain"]);
  if (input.tags.length > 0) entries.push(["ROLES", input.tags.join(" · ").toUpperCase(), "plain"]);
  for (const row of remark) entries.push([row.label.toUpperCase(), row.value, "lower"]);
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

/**
 * Load a picture the canvas may export.
 *
 * crossOrigin matters: without it the avatar taints the canvas and toBlob
 * throws, which would turn Save into a silent failure. Supabase storage
 * answers with Access-Control-Allow-Origin, so the request is honoured.
 * A photo that will not load resolves null rather than rejecting, and the
 * card falls back to the initial the app draws when there is no photo.
 */
function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * A font family canvas can actually use.
 *
 * The cosmetic faces are registered as `var(--font-name-pixel), monospace`
 * — a custom property, which a stylesheet resolves and a canvas does not.
 * Setting it on ctx.font silently failed and every saved card came out in
 * the default face. Letting the document resolve it hands back the real
 * family list, and the face is already loaded because the card on screen
 * is using it.
 */
function resolveFamily(family: string | undefined, fallback: string): string {
  if (!family) return fallback;
  if (!family.includes("var(")) return family;
  try {
    const probe = document.createElement("span");
    probe.style.fontFamily = family;
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).fontFamily;
    probe.remove();
    return resolved || fallback;
  } catch {
    return fallback;
  }
}

/** Break text into at most this many lines, each trimmed to fit. */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number, lines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= max) {
      line = next;
      continue;
    }
    if (line) out.push(line);
    line = word;
    if (out.length === lines) break;
  }
  if (line && out.length < lines) out.push(line);
  return out.slice(0, lines).map((l) => clip(ctx, l, max));
}

const PHOTO_INSET = 10;
const NAME_LINE = 26;
const BIO_LINE = 19;

/**
 * The front of the card, as a picture.
 *
 * The twin of drawHypefyId, and the same bargain: painted rather than
 * rasterised from the DOM, so it is a fixed size at a fixed density
 * whatever screen it was saved from. It reads the owner's name font from
 * the same place the card does, so a cosmetic face survives the export —
 * canvas can use any family the document has already loaded.
 *
 * Async only because the photograph has to arrive first.
 */
export async function drawProfileFront(input: IdCardInput): Promise<HTMLCanvasElement> {
  const f = families();
  const accent = input.accent ?? "#a3e635";
  const worn = nameStyle(input.cosmetics ?? {});
  const nameFamily = resolveFamily(worn?.fontFamily as string | undefined, f.sans);
  const nameWeight = (worn?.fontWeight as number | undefined) ?? 800;
  const nameFont = `${worn?.fontStyle === "italic" ? "italic " : ""}${nameWeight} 22px ${nameFamily}`;
  const photo = input.avatarUrl ? await loadImage(input.avatarUrl) : null;

  const gauge = document.createElement("canvas").getContext("2d");
  if (!gauge) throw new Error("no 2d context");
  const textW = W - 2 * PAD;

  // The badge sits beside the name, so the name has less room than the row.
  gauge.font = nameFont;
  const nameLines = wrap(gauge, input.name, textW - (input.verified ? 26 : 0), 2);
  gauge.font = `400 13.5px ${f.sans}`;
  const bioLines = input.bio?.trim() ? wrap(gauge, input.bio.trim(), textW, 2) : [];

  const side = W - 2 * PHOTO_INSET;
  let h = PHOTO_INSET + side + 16;
  h += nameLines.length * NAME_LINE + 18;
  if (bioLines.length) h += bioLines.length * BIO_LINE + 8;
  if (input.tags.length) h += 30;
  if (input.stats) h += 26;
  const footTop = h + 10;
  h = footTop + 30;

  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = h * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.scale(SCALE, SCALE);

  // The plate, clipped to its own corners — the same one the back uses.
  roundRect(ctx, 0, 0, W, h, 24);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = "#0b0b0c";
  ctx.fillRect(0, 0, W, h);
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.fillRect(0, 0, W, 1);
  ctx.fillStyle = "rgba(0,0,0,0.8)";
  ctx.fillRect(0, h - 4, W, 1);
  ctx.fillStyle = accent;
  ctx.fillRect(0, h - 3, W, 3);

  // The photograph, in the well the code sits in on the back.
  roundRect(ctx, PHOTO_INSET, PHOTO_INSET, side, side, WELL_RADIUS);
  ctx.fillStyle = "rgba(255,255,255,0.11)";
  ctx.fill();
  ctx.save();
  roundRect(ctx, PHOTO_INSET + 2, PHOTO_INSET + 2, side - 4, side - 4, WELL_RADIUS - 2);
  ctx.clip();
  if (photo) {
    // Cover, so a photo of any shape fills the square the way it does on
    // screen rather than arriving letterboxed.
    const scale = Math.max((side - 4) / photo.width, (side - 4) / photo.height);
    const pw = photo.width * scale;
    const ph = photo.height * scale;
    ctx.drawImage(photo, PHOTO_INSET + 2 + (side - 4 - pw) / 2, PHOTO_INSET + 2 + (side - 4 - ph) / 2, pw, ph);
  } else {
    const hue = input.hue ?? 200;
    const g = ctx.createLinearGradient(PHOTO_INSET, PHOTO_INSET, PHOTO_INSET + side, PHOTO_INSET + side);
    g.addColorStop(0, `hsl(${hue} 70% 46%)`);
    g.addColorStop(1, `hsl(${(hue + 50) % 360} 65% 30%)`);
    ctx.fillStyle = g;
    ctx.fillRect(PHOTO_INSET, PHOTO_INSET, side, side);
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = `800 120px ${f.sans}`;
    ctx.textAlign = "center";
    ctx.fillText(input.name.trim()[0]?.toUpperCase() ?? "?", W / 2, PHOTO_INSET + side / 2 + 42);
    ctx.textAlign = "left";
  }
  ctx.restore();

  const left = PAD;
  const right = W - PAD;
  ctx.textBaseline = "alphabetic";
  let y = PHOTO_INSET + side + 16 + 18;

  ctx.fillStyle = "#ffffff";
  ctx.font = nameFont;
  for (const line of nameLines) {
    ctx.fillText(line, left, y);
    y += NAME_LINE;
  }
  if (input.verified) {
    // A disc with a tick, which is what the star reads as at this size.
    const bx = left + Math.min(ctx.measureText(nameLines[nameLines.length - 1] ?? "").width + 9, textW - 18);
    const by = y - NAME_LINE - 7;
    ctx.beginPath();
    ctx.arc(bx + 8, by, 8, 0, Math.PI * 2);
    ctx.fillStyle = "#2f7df6";
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(bx + 4.5, by);
    ctx.lineTo(bx + 7, by + 3);
    ctx.lineTo(bx + 11.5, by - 3.5);
    ctx.stroke();
  }

  const handle = [input.username ? `@${input.username}` : null, pronounLabel(input.pronouns)]
    .filter(Boolean)
    .join("  ·  ");
  if (handle) {
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = `400 11.5px ${f.mono}`;
    ctx.fillText(clip(ctx, handle, textW), left, y - 4);
  }
  y += 14;

  if (bioLines.length) {
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = `400 13.5px ${f.sans}`;
    for (const line of bioLines) {
      ctx.fillText(line, left, y);
      y += BIO_LINE;
    }
    y += 8;
  }

  if (input.tags.length) {
    ctx.font = `700 10.5px ${f.sans}`;
    let x = left;
    for (const tag of input.tags) {
      const label = tag.toUpperCase();
      const w = ctx.measureText(label).width + 16;
      if (x + w > right) break;
      roundRect(ctx, x, y - 11, w, 19, 6);
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillText(label, x + 8, y + 2);
      x += w + 6;
    }
    y += 30;
  }

  if (input.stats) {
    ctx.font = `700 13px ${f.sans}`;
    ctx.fillStyle = "#ffffff";
    const hypers = String(input.stats.followers);
    ctx.fillText(hypers, left, y);
    const after = left + ctx.measureText(hypers).width + 5;
    ctx.font = `600 10px ${f.mono}`;
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    tracked(ctx, "HYPERS", after, y, 1.4);
    const second = after + ctx.measureText("HYPERS").width + 6 * 1.4 + 18;
    ctx.font = `700 13px ${f.sans}`;
    ctx.fillStyle = "#ffffff";
    const posts = String(input.stats.posts);
    ctx.fillText(posts, second, y);
    // Measured before the font changes: asking the 10px face how wide a
    // 13px numeral is put the label on top of it.
    const afterPosts = second + ctx.measureText(posts).width + 6;
    ctx.font = `600 10px ${f.mono}`;
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    tracked(ctx, "POSTS", afterPosts, y, 1.4);
  }

  // The foot: the address, and the mark, exactly as the back signs itself.
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(left, footTop - 12, right - left, 1);
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.font = `400 9.5px ${f.mono}`;
  ctx.fillText(prettyUrl(input.url), left, footTop + 8);
  ctx.font = `800 15px ${f.sans}`;
  const mark = "Hypefy";
  const dotW = ctx.measureText(".").width;
  const markW = ctx.measureText(mark).width + dotW;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText(mark, right - markW, footTop + 9);
  ctx.fillStyle = accent;
  ctx.fillText(".", right - dotW, footTop + 9);

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

async function toFile(canvas: HTMLCanvasElement, name: string): Promise<File | null> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  return blob ? new File([blob], name, { type: "image/png" }) : null;
}

/**
 * Hand both sides of the card to the person.
 *
 * Two pictures, not one. The card has a front and a back and they say
 * different things — the back is the credential, the front is the person
 * — so saving only the back meant the half most people would actually
 * post was the half you could not keep.
 *
 * On a phone this goes through the share sheet, which is where "Save
 * image" lives on both Android and iOS — writing to the gallery would
 * mean a native plugin and a store build, and the sheet also covers
 * sending them to someone, which is the other thing people do with them.
 * Sheets that take one file but not two get the back on its own rather
 * than nothing. On a desktop browser there is no sheet, so both download.
 */
export async function saveHypefyCard(input: IdCardInput): Promise<SaveResult> {
  const stem = input.username ?? "card";
  let files: File[];
  try {
    const [front, back] = await Promise.all([
      drawProfileFront(input).then((c) => toFile(c, `hypefy-${stem}-front.png`)),
      toFile(drawHypefyId(input), `hypefy-${stem}-id.png`),
    ]);
    files = [front, back].filter((x): x is File => x !== null);
  } catch {
    return "failed";
  }
  if (files.length === 0) return "failed";

  const canShare = typeof navigator.canShare === "function";
  // Both if the sheet will take both; otherwise the ID alone, which is
  // the one the button is named after.
  const offer = canShare && navigator.canShare({ files }) ? files : files.slice(-1);
  if (canShare && navigator.canShare({ files: offer })) {
    try {
      await navigator.share({ files: offer, title: `${input.name} on Hypefy` });
      return "shared";
    } catch {
      // Dismissed, or the sheet refused them. Fall through to a download
      // rather than reporting a failure the person caused.
    }
  }

  try {
    for (const file of files) {
      const href = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = href;
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(href), 10_000);
    }
    return "downloaded";
  } catch {
    return "failed";
  }
}
