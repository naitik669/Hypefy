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
 * The colours you can give your Diary, in groups of eight — one line each in
 * the colour picker, which you swipe through a group at a time.
 *
 *  - Jewel: deep, saturated inks spread round the wheel. "Ink", the first,
 *    is the default page: the charcoal above, glowing faintly in your own
 *    avatar hue.
 *  - Dusk: the same idea with the colour turned down — slate, clay, sage.
 *  - Glow: two inks blended corner to corner.
 *
 * Every one is dark enough for white words. Keys are what the database
 * stores (any lowercase word will do there); changing a hue here recolours
 * every page in that colour, and a key removed from this list falls back to
 * Ink. New colours go at the end of a group, or in a new group.
 */
const COLORS = [
  { key: "ink", label: "Ink", group: "jewel", hue: -1, sat: 0 },
  { key: "plum", label: "Plum", group: "jewel", hue: 285, sat: 42 },
  { key: "cobalt", label: "Cobalt", group: "jewel", hue: 226, sat: 58 },
  { key: "teal", label: "Teal", group: "jewel", hue: 186, sat: 60 },
  { key: "forest", label: "Forest", group: "jewel", hue: 152, sat: 42 },
  { key: "moss", label: "Moss", group: "jewel", hue: 82, sat: 48 },
  { key: "ember", label: "Ember", group: "jewel", hue: 16, sat: 62 },
  { key: "rose", label: "Rose", group: "jewel", hue: 338, sat: 52 },

  { key: "slate", label: "Slate", group: "dusk", hue: 215, sat: 22 },
  { key: "lilac", label: "Lilac", group: "dusk", hue: 262, sat: 30 },
  { key: "mauve", label: "Mauve", group: "dusk", hue: 318, sat: 24 },
  { key: "wine", label: "Wine", group: "dusk", hue: 348, sat: 40 },
  { key: "clay", label: "Clay", group: "dusk", hue: 18, sat: 32 },
  { key: "sand", label: "Sand", group: "dusk", hue: 36, sat: 30 },
  { key: "olive", label: "Olive", group: "dusk", hue: 64, sat: 26 },
  { key: "sage", label: "Sage", group: "dusk", hue: 150, sat: 20 },

  { key: "sunset", label: "Sunset", group: "glow", hue: 14, sat: 62, hue2: 334 },
  { key: "candy", label: "Candy", group: "glow", hue: 330, sat: 54, hue2: 265 },
  { key: "galaxy", label: "Galaxy", group: "glow", hue: 268, sat: 50, hue2: 222 },
  { key: "ocean", label: "Ocean", group: "glow", hue: 224, sat: 58, hue2: 186 },
  { key: "aurora", label: "Aurora", group: "glow", hue: 172, sat: 54, hue2: 282 },
  { key: "lagoon", label: "Lagoon", group: "glow", hue: 190, sat: 56, hue2: 150 },
  { key: "zest", label: "Zest", group: "glow", hue: 92, sat: 50, hue2: 168 },
  { key: "flame", label: "Flame", group: "glow", hue: 42, sat: 66, hue2: 8 },
] as const;

export type DiaryColor = (typeof COLORS)[number]["key"];
export type ColorGroupKey = (typeof COLORS)[number]["group"];
export type ColorDef = { key: DiaryColor; label: string; group: ColorGroupKey; hue: number; sat: number; hue2?: number };

export const DIARY_COLORS: readonly ColorDef[] = COLORS;

/** The groups, in order, each with its colours. */
export const COLOR_GROUPS: { key: ColorGroupKey; label: string; colors: ColorDef[] }[] = (
  [
    ["jewel", "Jewel"],
    ["dusk", "Dusk"],
    ["glow", "Glow"],
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
  return `linear-gradient(135deg, hsl(${c.hue} ${c.sat + 10}% 52%), hsl(${h2} ${c.sat}% ${c.hue2 === undefined ? 26 : 34}%))`;
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
  return {
    background: `radial-gradient(120% 90% at 0% 0%, hsl(${h} ${s + 10}% 58% / 0.32), transparent 60%), linear-gradient(165deg, hsl(${h} ${s}% ${blend ? 31 : 29}%), hsl(${h2} ${s - 6}% ${blend ? 19 : 15}%))`,
    shadow: `inset 0 1px 0 hsl(${h} 80% 88% / 0.14), 0 22px 44px -26px hsl(${h2} 60% 6% / 0.95)`,
    burn: blend ? `linear-gradient(90deg, hsl(${h} 90% 72%), hsl(${h2} 90% 72%))` : `hsl(${h} 90% 72%)`,
    screen: `radial-gradient(90% 60% at 10% 0%, hsl(${h} ${s + 10}% 55% / 0.45), transparent 70%), linear-gradient(180deg, hsl(${h} ${s}% 24%), hsl(${h2} ${s - 6}% 9%))`,
  };
}
