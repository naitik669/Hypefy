/**
 * Sticker packs (0224), from the 27 Nov design "Packs & the drawer rail".
 *
 * A pack is a name and 2 to 30 stickers that already exist. It is made only
 * from stickers you can already reach, from three sources: Yours, Saved
 * (sent to you in chats, and your favourites) and In packs. A sticker can be
 * in several packs, and taking one out of a pack never deletes it.
 *
 * This file is the reading of the shapes the server sends and the rules a
 * client needs to draw a pack. No fetching and no DOM.
 */
import { readStickerRow, type Sticker } from "./stickers";

export const PACK_MIN = 2;
export const PACK_MAX = 30;
export const PACK_NAME_MAX = 40;

/** anyone with the code, or only the people the maker sends it to. */
export const PACK_AUDIENCES = ["link", "people"] as const;
export type PackAudience = (typeof PACK_AUDIENCES)[number];

export type StickerPack = {
  id: string;
  name: string;
  code: string;
  audience: PackAudience;
  coverStickerId: string | null;
  owner: { id: string; username: string | null; displayName: string | null };
  /** About whoever asked, worked out by the server when it was read. */
  mine: boolean;
  saved: boolean;
  /** Added but not opened yet: the rail marks its cover with a dot. */
  fresh: boolean;
  stickers: Sticker[];
};

const CODE = /^[2-9A-HJ-NP-Z]{8}$/;

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/** One pack as sticker_pack_json() sends it, or null if it is not one. */
export function readPack(v: unknown): StickerPack | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const id = str(r.id);
  const name = str(r.name);
  const code = str(r.code);
  if (!id || !name || !code || !CODE.test(code)) return null;
  const o = (r.owner && typeof r.owner === "object" ? r.owner : {}) as Record<string, unknown>;
  const ownerId = str(o.id);
  if (!ownerId) return null;
  const stickers = Array.isArray(r.stickers)
    ? r.stickers.map(readStickerRow).filter((s): s is Sticker => s !== null)
    : [];
  return {
    id,
    name,
    code,
    audience: r.audience === "people" ? "people" : "link",
    coverStickerId: str(r.cover_sticker_id),
    owner: { id: ownerId, username: str(o.username), displayName: str(o.display_name) },
    mine: r.mine === true,
    saved: r.saved === true,
    fresh: r.fresh === true,
    stickers,
  };
}

/** A list of packs (my_sticker_packs), skipping anything unreadable. */
export function readPacks(v: unknown): StickerPack[] {
  return Array.isArray(v) ? v.map(readPack).filter((p): p is StickerPack => p !== null) : [];
}

/**
 * The stickers drawn on a pack's cover, front first: the chosen cover if it
 * is still in the pack, then the next ones in, up to three. The cover is
 * built from the pack — there is no separate upload.
 */
export function packCover(stickers: readonly Sticker[], coverId: string | null, n = 3): Sticker[] {
  const front = coverId ? stickers.find((s) => s.id === coverId) : undefined;
  const rest = stickers.filter((s) => s !== front);
  return (front ? [front, ...rest] : rest).slice(0, n);
}

/** K7Q2M9XD → "K7Q2-M9XD", the way the code is shown and read aloud. */
export function formatPackCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

/**
 * What somebody typed, as a code, or null if it cannot be one. Spaces,
 * dashes and case do not matter, so "k7q2 m9xd" and "K7Q2-M9XD" are the
 * same pack. Never guesses at a misread character: a wrong guess opens a
 * stranger's pack.
 */
export function normalisePackCode(typed: string): string | null {
  const c = typed.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return CODE.test(c) ? c : null;
}

/** The pack's link. */
export function packLink(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, "")}/stickers/p/${code}`;
}

/** A name the server will take, or the reason it will not. */
export function checkPackName(name: string): { ok: true; name: string } | { ok: false; error: string } {
  const t = name.trim();
  if (t.length === 0) return { ok: false, error: "Give it a name." };
  if (t.length > PACK_NAME_MAX) return { ok: false, error: `Up to ${PACK_NAME_MAX} characters.` };
  return { ok: true, name: t };
}

export type PackSource = "yours" | "saved" | "inPacks";

/**
 * The picker's three sources, each sticker once per source. Saved is what
 * people sent you in chats plus your favourites, minus your own (which are
 * in Yours). In packs is everything in the packs on your rail. A sticker
 * can show in more than one source — it is the same sticker either way.
 */
export function pickerSources(input: {
  yours: readonly Sticker[];
  favourites: readonly Sticker[];
  received: readonly Sticker[];
  packs: readonly StickerPack[];
}): Record<PackSource, Sticker[]> {
  const own = new Set(input.yours.map((s) => s.id));
  const once = (list: readonly Sticker[]) => {
    const seen = new Set<string>();
    return list.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
  };
  return {
    yours: once(input.yours),
    saved: once([...input.received, ...input.favourites].filter((s) => !own.has(s.id))),
    inPacks: once(input.packs.flatMap((p) => p.stickers)),
  };
}

/**
 * Ticking in the picker: tap to tick, tap again to untick. A tick past the
 * pack's room is refused rather than dropping an earlier one.
 */
export function togglePick(picked: readonly string[], id: string, room: number = PACK_MAX): string[] {
  if (picked.includes(id)) return picked.filter((p) => p !== id);
  if (picked.length >= room) return [...picked];
  return [...picked, id];
}

/** "4 picked · 2 to 30", the picker's subtitle. */
export function pickedLabel(n: number): string {
  return `${n} picked · ${PACK_MIN} to ${PACK_MAX}`;
}

/** Who made it, as the pack sheet says it. */
export function packByline(p: StickerPack): string {
  const n = p.stickers.length;
  const count = `${n} sticker${n === 1 ? "" : "s"}`;
  if (p.mine) return `${count} · yours`;
  const who = p.owner.displayName || (p.owner.username ? `@${p.owner.username}` : "someone");
  return `${count} · by ${who}`;
}
