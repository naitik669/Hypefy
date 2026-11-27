/**
 * Stickers in a conversation (0220).
 *
 * A sticker is a picture with one choice attached: how its edge is drawn.
 * It has no name — the picture is the whole of it (Naitik, 27 Nov).
 *
 * This file is the reading of the shapes and the arithmetic: no fetching,
 * no DOM, so both clients can use it and the rules can be checked without
 * a database or a browser.
 */

/** The storage bucket the files live in. Public, unguessable names (0220). */
export const STICKER_BUCKET = "stickers";

/** Longest side a sticker is stored at, in pixels. */
export const STICKER_MAX_PX = 512;

/** The bucket's own cap. Checked before uploading so the refusal is ours. */
export const STICKER_MAX_BYTES = 1024 * 1024;

/** How a sticker's edge is drawn. Stroke is a white outline added when it
 *  is drawn; clean is the cutout as it is. Never baked into the file. */
export const STICKER_EDGES = ["stroke", "clean"] as const;
export type StickerEdge = (typeof STICKER_EDGES)[number];

/** What somebody gets when they make one and do not choose. */
export const DEFAULT_STICKER_EDGE: StickerEdge = "stroke";

export function isStickerEdge(v: unknown): v is StickerEdge {
  return v === "stroke" || v === "clean";
}

/** A sticker as the drawer and the thread need it. */
export type Sticker = {
  id: string;
  path: string;
  edge: StickerEdge;
  width: number;
  height: number;
};

/** The storage path shape 0220's check constraint enforces. */
const PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|webp)$/;

function positiveInt(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 1 ? Math.round(v) : null;
}

/** A stickers row as it comes back from the table, or null if it is not one. */
export function readStickerRow(row: unknown): Sticker | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const width = positiveInt(r.width);
  const height = positiveInt(r.height);
  if (typeof r.id !== "string" || typeof r.path !== "string" || !PATH.test(r.path)) return null;
  if (!width || !height) return null;
  return {
    id: r.id,
    path: r.path,
    edge: isStickerEdge(r.edge) ? r.edge : DEFAULT_STICKER_EDGE,
    width,
    height,
  };
}

/**
 * The sticker a message carries, or null if it does not carry one.
 *
 * send_sticker writes { sticker_id, path, edge, w, h } into the metadata.
 * Checked rather than trusted: a jsonb column can hold an older shape or
 * nothing, and that must read as "not a sticker", not throw mid-thread.
 * An unsent sticker shows nothing, like any unsent message.
 */
export function readSticker(m: {
  kind: string;
  is_unsent?: boolean;
  metadata?: unknown;
}): Sticker | null {
  if (m.kind !== "sticker" || m.is_unsent) return null;
  const meta = m.metadata as Record<string, unknown> | null | undefined;
  if (!meta || typeof meta !== "object") return null;
  return readStickerRow({
    id: meta.sticker_id,
    path: meta.path,
    edge: meta.edge,
    width: meta.w,
    height: meta.h,
  });
}

/** The public URL of a sticker's file, from the project's Supabase URL. */
export function stickerUrl(supabaseUrl: string, path: string): string {
  const base = supabaseUrl.replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/${STICKER_BUCKET}/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

/**
 * How far a sticker in the thread is turned, in degrees, between -3 and 3.
 *
 * From the message id, so a wall of stickers looks scattered but each one
 * sits the same way every time it is drawn — on a re-render, after a
 * reload, on the other person's screen. Past ±4° a cutout reads as a
 * mistake rather than a choice, so it stays inside ±3 (D2 B).
 */
export function stickerTilt(messageId: string): number {
  // FNV-1a: cheap, and spreads ids that differ in one character.
  let h = 0x811c9dc5;
  for (let i = 0; i < messageId.length; i++) {
    h ^= messageId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const unit = (h >>> 0) / 0xffffffff; // 0..1
  return Math.round((unit * 6 - 3) * 10) / 10;
}

/** The size to store a picture at: its own size, or shrunk so its longer
 *  side is `max`. Never enlarged — that only adds bytes and blur. */
export function stickerFit(
  width: number,
  height: number,
  max: number = STICKER_MAX_PX,
): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Stickers somebody sent, newest first, each once.
 *
 * From their own sticker messages, so "Recent" is the same on every device
 * and needs no table of its own. A sticker sent five times is one tile.
 */
export function recentStickers(
  rows: { kind: string; is_unsent?: boolean; metadata?: unknown }[],
  limit = 24,
): Sticker[] {
  const seen = new Set<string>();
  const out: Sticker[] = [];
  for (const row of rows) {
    const s = readSticker(row);
    if (!s || seen.has(s.id)) continue;
    seen.add(s.id);
    out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}
