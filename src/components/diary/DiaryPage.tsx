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

/** "22h", "40m", "now" — for the signature line, where "left" is implied. */
export function shortLeft(createdAt: string, now = Date.now()): string {
  // Capped at the full day: a phone whose clock runs behind the server's
  // would otherwise count a fresh Diary as having more than 24 hours left.
  const ms = Math.min(
    new Date(createdAt).getTime() + DIARY_HOURS * 3_600_000 - now,
    DIARY_HOURS * 3_600_000
  );
  if (!(ms > 0)) return "now";
  const h = Math.floor(ms / 3_600_000);
  return h >= 1 ? `${h}h` : `${Math.max(1, Math.floor(ms / 60_000))}m`;
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
