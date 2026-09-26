import { DIARY_HOURS } from "@/lib/diary";

/**
 * How a Diary page looks — shared by the cards, the composer, full-screen and
 * the archive, so all four are the same page.
 */

/** Share of the 24 hours remaining, 0..1. */
export function lifeLeft(createdAt: string, now = Date.now()): number {
  const ms = new Date(createdAt).getTime() + DIARY_HOURS * 3_600_000 - now;
  return Math.max(0, Math.min(1, ms / (DIARY_HOURS * 3_600_000)));
}

/**
 * "now", "5m ago", "3h ago" — how long ago a page went up. People read a
 * page by how fresh it is; how long it has left is the burn line's job.
 * A phone whose clock runs behind the server's reads "now", never a time
 * in the future.
 */
export function timeAgo(createdAt: string, now = Date.now()): string {
  const ms = now - new Date(createdAt).getTime();
  if (!(ms >= 60_000)) return "now";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * The note's type size, from its length.
 *
 * A two-word note set at the size of a paragraph looks like a mistake; a
 * paragraph set at the size of two words does not fit. Counted in grapheme-
 * ish units (Array.from) so an emoji counts once, not as two UTF-16 halves.
 */
export function noteSize(text: string): { size: number; clamp: number } {
  const n = Array.from(text.trim()).length;
  if (n <= 6) return { size: 44, clamp: 2 };
  if (n <= 14) return { size: 30, clamp: 3 };
  if (n <= 28) return { size: 22, clamp: 4 };
  if (n <= 44) return { size: 18, clamp: 5 };
  return { size: 15, clamp: 6 };
}

/**
 * The note's size on a card, px: as large as the card can take it, so a
 * page that says "HDB" fills its card instead of leaving it looking empty,
 * and a full sentence still fits in a few lines.
 *
 * Two limits, the smaller wins: one by how much there is to say, and one so
 * the longest word fits across the card on its own (a 6-letter word at 80px
 * would run off the edge). Measured for a card about 250px wide inside; wider
 * cards simply have room to spare.
 */
/**
 * The size for a caption kept to one line, as a photo page's is.
 *
 * Short words stay big; past about twenty characters it settles at 26px and
 * stops shrinking, because a caption small enough to fit sixty characters
 * across a card is too small to read. Anything that still does not fit
 * travels instead (see PageCaption) — so this only has to be close, and the
 * floor matters more than the arithmetic.
 */
export function lineSize(text: string, inside = 250): number {
  const n = Math.max(1, Array.from(text.trim()).length);
  // Bold letters average about 0.55em across a whole line, wider than the
  // 0.68em-per-character estimate fillSize uses on a single long word.
  return Math.max(26, Math.min(44, Math.floor(inside / (0.55 * n))));
}

export function fillSize(text: string, inside = 250): number {
  const t = text.trim();
  const n = Array.from(t).length;
  const byLength = n <= 3 ? 104 : n <= 6 ? 84 : n <= 10 ? 60 : n <= 16 ? 46 : n <= 24 ? 38 : n <= 36 ? 31 : n <= 48 ? 26 : 22;
  // Bold letters run about 0.68em wide; an emoji counts as a letter.
  const longest = Math.max(1, ...t.split(/\s+/).map((w) => Array.from(w).length));
  const byWord = Math.floor(inside / (0.68 * longest));
  return Math.max(18, Math.min(byLength, byWord));
}

/**
 * The page colours for an author's hue.
 *
 * One ink for every page — a deep, nearly neutral charcoal — with the
 * author's hue as a low glow in the top corner rather than the whole page.
 * The first version tinted each page fully in its hue and drew a border in
 * it; side by side, six saturated pages with six coloured outlines read as
 * noise. Here the pages match, and the colour says whose page it is quietly.
 *
 * No border: the edge is a one-pixel highlight along the top and a soft
 * shadow below, the way a sheet sits on a desk.
 */
export function pageTint(hue: number) {
  return {
    background: `radial-gradient(120% 85% at 0% 0%, hsl(${hue} 55% 42% / 0.22), transparent 62%), linear-gradient(172deg, hsl(${hue} 10% 14%), hsl(${hue} 8% 9.5%))`,
    shadow: `inset 0 1px 0 hsl(${hue} 60% 85% / 0.08), 0 20px 40px -28px rgb(0 0 0 / 0.9)`,
    burn: `hsl(${hue} 75% 66%)`,
    /** Full-screen: the same ink, the glow given more room. */
    screen: `radial-gradient(90% 60% at 10% 0%, hsl(${hue} 55% 40% / 0.35), transparent 70%), linear-gradient(180deg, hsl(${hue} 10% 12%), hsl(${hue} 8% 6%))`,
  };
}

/**
 * The colours you can give your Diary, a family to a line: neutrals, reds
 * and pinks, oranges and golds, greens, blues and teals, purples — eight
 * shades of each, running light to deep or round the family's hues so the
 * line reads as one sweep. You swipe the colour picker a line at a time, so
 * you look for "a blue" on the blue line, not among everything.
 *
 * "Ink", first of all, is the default page: the charcoal above, glowing
 * faintly in your own avatar hue. A colour with `hue2` is a blend, one ink
 * at the top running to the other at the foot; it sits on the line of the
 * colour it starts from. `lum` nudges a shade lighter or deeper.
 *
 * Every one is dark enough for white words — the page's lightness is set
 * below, not here. Keys are what the database stores (any lowercase word
 * will do there): changing a hue recolours every page in that colour, a
 * key removed falls back to Ink, and keys already in use must never be
 * renamed. Families can grow past eight into a second line of their own.
 */
const COLORS = [
  { key: "ink", label: "Ink", group: "neutral", hue: -1, sat: 0 },
  { key: "graphite", label: "Graphite", group: "neutral", hue: 220, sat: 8, lum: -3 },
  { key: "smoke", label: "Smoke", group: "neutral", hue: 250, sat: 12 },
  { key: "slate", label: "Slate", group: "neutral", hue: 215, sat: 22 },
  { key: "stone", label: "Stone", group: "neutral", hue: 40, sat: 10, lum: 2 },
  { key: "taupe", label: "Taupe", group: "neutral", hue: 20, sat: 16 },
  { key: "sand", label: "Sand", group: "neutral", hue: 36, sat: 30 },
  { key: "cocoa", label: "Cocoa", group: "neutral", hue: 22, sat: 30, lum: -4 },

  { key: "blush", label: "Blush", group: "red", hue: 344, sat: 42, lum: 4 },
  { key: "rose", label: "Rose", group: "red", hue: 338, sat: 52 },
  { key: "candy", label: "Candy", group: "red", hue: 330, sat: 54, hue2: 265 },
  { key: "magenta", label: "Magenta", group: "red", hue: 320, sat: 52 },
  { key: "berry", label: "Berry", group: "red", hue: 328, sat: 46, lum: -4 },
  { key: "wine", label: "Wine", group: "red", hue: 348, sat: 40 },
  { key: "ruby", label: "Ruby", group: "red", hue: 354, sat: 60, lum: -2 },
  { key: "crimson", label: "Crimson", group: "red", hue: 2, sat: 66 },

  { key: "sunset", label: "Sunset", group: "orange", hue: 14, sat: 62, hue2: 334 },
  { key: "ember", label: "Ember", group: "orange", hue: 16, sat: 62 },
  { key: "rust", label: "Rust", group: "orange", hue: 12, sat: 54, lum: -4 },
  { key: "clay", label: "Clay", group: "orange", hue: 18, sat: 32 },
  { key: "copper", label: "Copper", group: "orange", hue: 24, sat: 52 },
  { key: "flame", label: "Flame", group: "orange", hue: 42, sat: 66, hue2: 8 },
  { key: "amber", label: "Amber", group: "orange", hue: 36, sat: 64 },
  { key: "honey", label: "Honey", group: "orange", hue: 44, sat: 58, lum: 2 },

  { key: "zest", label: "Zest", group: "green", hue: 92, sat: 50, hue2: 168 },
  { key: "moss", label: "Moss", group: "green", hue: 82, sat: 48 },
  { key: "olive", label: "Olive", group: "green", hue: 64, sat: 26 },
  { key: "sage", label: "Sage", group: "green", hue: 150, sat: 20 },
  { key: "emerald", label: "Emerald", group: "green", hue: 145, sat: 56 },
  { key: "jade", label: "Jade", group: "green", hue: 162, sat: 48, lum: 2 },
  { key: "forest", label: "Forest", group: "green", hue: 152, sat: 42 },
  { key: "pine", label: "Pine", group: "green", hue: 166, sat: 40, lum: -5 },

  { key: "lagoon", label: "Lagoon", group: "blue", hue: 190, sat: 56, hue2: 150 },
  { key: "teal", label: "Teal", group: "blue", hue: 186, sat: 60 },
  { key: "petrol", label: "Petrol", group: "blue", hue: 198, sat: 50, lum: -4 },
  { key: "ocean", label: "Ocean", group: "blue", hue: 224, sat: 58, hue2: 186 },
  { key: "sky", label: "Sky", group: "blue", hue: 205, sat: 58, lum: 4 },
  { key: "denim", label: "Denim", group: "blue", hue: 214, sat: 36 },
  { key: "cobalt", label: "Cobalt", group: "blue", hue: 226, sat: 58 },
  { key: "navy", label: "Navy", group: "blue", hue: 230, sat: 50, lum: -6 },

  { key: "galaxy", label: "Galaxy", group: "purple", hue: 268, sat: 50, hue2: 222 },
  { key: "violet", label: "Violet", group: "purple", hue: 272, sat: 52 },
  { key: "lilac", label: "Lilac", group: "purple", hue: 262, sat: 30 },
  { key: "plum", label: "Plum", group: "purple", hue: 285, sat: 42 },
  { key: "grape", label: "Grape", group: "purple", hue: 290, sat: 46, lum: -4 },
  { key: "orchid", label: "Orchid", group: "purple", hue: 300, sat: 40, lum: 3 },
  { key: "mauve", label: "Mauve", group: "purple", hue: 318, sat: 24 },
  // Last, not first: it sets off teal, and at the front it read as a blue.
  { key: "aurora", label: "Aurora", group: "purple", hue: 172, sat: 54, hue2: 282 },
] as const;

export type DiaryColor = (typeof COLORS)[number]["key"];
export type ColorGroupKey = (typeof COLORS)[number]["group"];
export type ColorDef = {
  key: DiaryColor;
  label: string;
  group: ColorGroupKey;
  hue: number;
  sat: number;
  hue2?: number;
  lum?: number;
};

export const DIARY_COLORS: readonly ColorDef[] = COLORS;

/** The families, in order, each with its colours. */
export const COLOR_GROUPS: { key: ColorGroupKey; label: string; colors: ColorDef[] }[] = (
  [
    ["neutral", "Neutrals"],
    ["red", "Reds and pinks"],
    ["orange", "Oranges and golds"],
    ["green", "Greens"],
    ["blue", "Blues and teals"],
    ["purple", "Purples"],
  ] as const
).map(([key, label]) => ({ key, label, colors: DIARY_COLORS.filter((c) => c.group === key) }));

/** The groups as the colour picker shows them, Ink drawn in your hue. */
export function pageColorGroups(hue: number) {
  return COLOR_GROUPS.map((g) => ({
    key: g.key,
    label: g.label,
    colors: g.colors.map((c) => ({ key: c.key, label: c.label, background: swatchOf(c.key, hue) })),
  }));
}

/** A colour's key, or "ink" for anything unknown or unset. */
export function colorKey(color: string | null | undefined): DiaryColor {
  return DIARY_COLORS.some((c) => c.key === color) ? (color as DiaryColor) : "ink";
}

/** What a swatch shows for a colour. */
export function swatchOf(color: DiaryColor, hue: number): string {
  const c = DIARY_COLORS.find((d) => d.key === color)!;
  if (c.key === "ink") return `linear-gradient(135deg, hsl(${hue} 40% 34%), hsl(${hue} 8% 12%) 70%)`;
  const h2 = c.hue2 ?? c.hue;
  const l = c.lum ?? 0;
  return `linear-gradient(135deg, hsl(${c.hue} ${c.sat + 10}% ${52 + l * 1.5}%), hsl(${h2} ${c.sat}% ${(c.hue2 === undefined ? 26 : 34) + l}%))`;
}

/**
 * The page for a Diary: its chosen colour, or Ink in the author's hue. Same
 * four surfaces as pageTint, so every place a page is drawn takes either.
 * A Glow colour runs from its first ink at the top to its second at the foot.
 */
export function diaryTheme(color: string | null | undefined, hue: number) {
  const c = DIARY_COLORS.find((d) => d.key === colorKey(color))!;
  if (c.key === "ink") return pageTint(hue);
  const { hue: h, sat: s } = c;
  const h2 = c.hue2 ?? h;
  const blend = c.hue2 !== undefined;
  const l = c.lum ?? 0;
  const s2 = Math.max(0, s - 6);
  // A near-grey page gets a near-grey burn line, not a vivid one.
  const bs = s < 20 ? s + 40 : 90;
  return {
    background: `radial-gradient(120% 90% at 0% 0%, hsl(${h} ${s + 10}% 58% / 0.32), transparent 60%), linear-gradient(165deg, hsl(${h} ${s}% ${(blend ? 31 : 29) + l}%), hsl(${h2} ${s2}% ${(blend ? 19 : 15) + l / 2}%))`,
    shadow: `inset 0 1px 0 hsl(${h} 80% 88% / 0.14), 0 22px 44px -26px hsl(${h2} 60% 6% / 0.95)`,
    burn: blend ? `linear-gradient(90deg, hsl(${h} ${bs}% 72%), hsl(${h2} ${bs}% 72%))` : `hsl(${h} ${bs}% 72%)`,
    screen: `radial-gradient(90% 60% at 10% 0%, hsl(${h} ${s + 10}% 55% / 0.45), transparent 70%), linear-gradient(180deg, hsl(${h} ${s}% ${24 + l}%), hsl(${h2} ${s2}% 9%))`,
  };
}
