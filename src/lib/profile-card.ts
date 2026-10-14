/**
 * Profile card — the shareable view behind an expanded avatar.
 *
 * One card, two faces: the front is the person, the back is their Hypefy ID
 * (the QR, the numbers, the thing you save to your photos). The colour is
 * stored on profiles.card_theme and the links in profile_links. Both are
 * readable by anyone, because a card that needs an account defeats the QR
 * on it.
 *
 * There used to be seven layouts. They were seven different answers to one
 * question, which meant no single one was finished, and a card you meet on
 * someone else's profile should be recognisably the same object every time.
 * The card is now the framed layout, and the choices that remain — colour
 * and links — are the ones that say something about the person.
 */

/* ── Colour ──────────────────────────────────────────────────────────────── */

export type Rgb = readonly [number, number, number];

/**
 * A card colour.
 *
 * Every theme is the same recipe with two hues swapped in: a light source
 * low on the left, a dimmer counter-bloom off the top-right corner, over a
 * vertical ink ramp. The old themes were each invented separately — a flat
 * two-stop diagonal beside a hard radial beside a repeating grid — and the
 * set read as a grab-bag rather than a palette.
 *
 * The light sits low because of where the card is actually visible. A
 * photograph fills the top two thirds; a bloom in the top-left corner, which
 * is the instinctive place for one, lands entirely behind the picture and
 * the card reads as flat black. The colour belongs under the name, where
 * there is card to colour.
 *
 * The numbers live here rather than in a CSS string so the canvas that
 * exports the card to an image can paint the identical background. A card
 * that looks one way on screen and another in your photos is two cards.
 */
export type CardTheme = {
  id: string;
  label: string;
  /** The light, low on the left where the card shows below the photo. */
  bloom: Rgb;
  /** A dimmer counter-light off the top-right corner, to catch the frame. */
  counter: Rgb;
};

export const CARD_THEMES: CardTheme[] = [
  { id: "onyx", label: "Onyx", bloom: [196, 205, 221], counter: [120, 130, 150] },
  { id: "lime", label: "Lime", bloom: [163, 230, 53], counter: [34, 197, 94] },
  { id: "ember", label: "Ember", bloom: [251, 146, 60], counter: [244, 63, 94] },
  { id: "violet", label: "Violet", bloom: [167, 139, 250], counter: [56, 189, 248] },
  { id: "glacier", label: "Glacier", bloom: [125, 211, 252], counter: [45, 212, 191] },
  { id: "bloom", label: "Bloom", bloom: [244, 114, 182], counter: [129, 140, 248] },
];

export const DEFAULT_THEME = "lime";

/** The ink ramp every theme shares, darkest at the foot. */
export const CARD_INK = ["#17171b", "#0c0c0f", "#08080a"] as const;

/**
 * Cards saved before the palette was rebuilt. Six accounts had picked a
 * colour; without this they would all silently become the default on their
 * next load, which is a worse first impression than a slightly different
 * green.
 */
const RENAMED: Record<string, string> = {
  "lime-pulse": "lime",
  "purple-night": "violet",
  "blue-signal": "glacier",
  "neon-grid": "onyx",
  "creator-mode": "violet",
  "rainbow-glow": "bloom",
};

export function cardTheme(id?: string | null): CardTheme {
  const key = (id && RENAMED[id]) ?? id;
  return CARD_THEMES.find((t) => t.id === key) ?? CARD_THEMES.find((t) => t.id === DEFAULT_THEME)!;
}

const rgba = (c: Rgb, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/** The theme as a CSS background. Mirrored on canvas by paintCardBackground. */
export function cardBackground(theme: CardTheme): string {
  return [
    `radial-gradient(118% 88% at 6% 86%, ${rgba(theme.bloom, 0.42)}, transparent 62%)`,
    `radial-gradient(86% 70% at 104% -6%, ${rgba(theme.counter, 0.3)}, transparent 60%)`,
    `linear-gradient(180deg, ${CARD_INK[0]} 0%, ${CARD_INK[1]} 62%, ${CARD_INK[2]} 100%)`,
  ].join(", ");
}

/** A swatch for the colour picker: the same recipe in a 40px square. */
export function cardSwatch(theme: CardTheme): string {
  return [
    `radial-gradient(120% 120% at 20% 0%, ${rgba(theme.bloom, 0.85)}, transparent 62%)`,
    `radial-gradient(100% 100% at 100% 100%, ${rgba(theme.counter, 0.6)}, transparent 65%)`,
    CARD_INK[1],
  ].join(", ");
}

/* ── Links ───────────────────────────────────────────────────────────────── */

/** Hard cap, matching the profile_links_limit trigger in the database. */
export const MAX_LINKS = 8;

export type ProfileLink = {
  id: string;
  label: string;
  url: string;
  position: number;
};

/* ── Addresses ───────────────────────────────────────────────────────────── */

/**
 * Where a scanned card lands. Not the apex: hypefy.chat is the marketing
 * site, and /u/ is open on the app host specifically so a shared profile
 * is readable without an invite code.
 */
export const APP_ORIGIN = "https://app.hypefy.chat";

export function profileUrl(username: string | null): string {
  return username ? `${APP_ORIGIN}/u/${username}` : APP_ORIGIN;
}

/**
 * Only http(s) survives. The database rejects anything else on write, but
 * rows predating that constraint — or a URL that slipped through a future
 * migration — must never reach an anchor's href as javascript: or data:.
 */
export function safeHref(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** "https://example.com/shop?x=1" -> "example.com/shop" */
export function prettyUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "");
    return `${u.hostname.replace(/^www\./, "")}${path}`;
  } catch {
    return url;
  }
}

/* ── The ID ──────────────────────────────────────────────────────────────── */

/**
 * The number printed on the back of the card.
 *
 * Taken from the account's own id rather than generated, so it is stable
 * for life and the same on every device, and formatted in fours because a
 * credential number you might read aloud should be readable aloud. It is
 * not a secret: user ids are already public on every row this app serves,
 * and the QR beside it carries more.
 */
export function hypefyId(userId: string): string {
  const hex = userId.replace(/-/g, "").toUpperCase();
  return `${hex.slice(0, 4)} ${hex.slice(4, 8)} ${hex.slice(8, 12)}`;
}

/** "Member since March 2026" — the month, never the day. */
export function memberSince(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}
