/**
 * The design tokens, as values rather than as CSS.
 *
 * The web app reads these from `@theme` in globals.css, which Tailwind turns
 * into utilities — `--color-surface` becomes `bg-surface`, `text-surface` and
 * so on. React Native has no CSS and no Tailwind at-rules, so from Phase 5 it
 * needs the same numbers as a plain object.
 *
 * Two copies of a palette is how a brand drifts: a colour gets nudged in one
 * place, nobody notices, and six months later the app and the website are
 * almost the same shade of lime. So rather than generating the CSS from here
 * — which would put a codegen step in front of every web build for a file
 * that changes a few times a year — a test reads both and asserts they agree,
 * in both directions. See tests/tokens.test.ts.
 *
 * Deliberately values only: no React, no StyleSheet, no CSS-in-JS. What each
 * platform does with them is that platform's business.
 */

/** The palette, keyed exactly as the CSS custom properties are. */
export const colors = {
  /** Near-black app background. */
  background: "#0a0a0a",
  /** Cards. */
  surface: "#141414",
  /** Raised cards and sheets. */
  elevated: "#1e1e1e",
  /** Dividers and outlines. */
  border: "#2a2a2a",

  /** Primary text. */
  foreground: "#ffffff",
  /** Secondary text. */
  muted: "#8a8a8a",
  /**
   * Tertiary text and inactive icons.
   *
   * 4.94:1 on background and 4.60:1 on surface, so normal text clears AA on
   * both; 4.16:1 on elevated, which clears the 3:1 bar for large text and UI
   * but not small text — sheet body text should use `muted`. It was #555555,
   * which is 2.66:1 and was the single biggest accessibility defect in the app.
   */
  faint: "#7f7f7f",

  /** Brand: electric lime, deepened for calm on black. */
  accent: "#a3e635",
  accentDeep: "#3f6212",
  /** Text on accent fills. */
  accentInk: "#0a0a0a",

  /** The active Hype star. */
  hype: "#ffd000",
  hypeLit: "#ffe066",
  hypeDeep: "#b07800",

  verified: "#4d8dff",
  hashtag: "#4ea1ff",
  danger: "#ff4545",
} as const;

export type ColorName = keyof typeof colors;

/**
 * Chrome measurements that both platforms need.
 *
 * `navSpace` is deliberately not a constant: it is the bar's height plus the
 * device's bottom inset plus air, and the inset is only known at runtime. The
 * web expresses it as calc() in CSS; a native client will compute it from its
 * own safe-area values. The 12 is air, so a scroll container's last row ends
 * up clear of the bar rather than flush against it.
 */
export const layout = {
  /** The bottom nav bar's own height, in px. */
  navHeight: 72,
  /** Air between the bar and whatever scrolls above it, in px. */
  navGap: 12,
  /**
   * The top bar's own height, in px, before the safe-area inset.
   *
   * Here for the same reason navHeight is: two clients draw this bar and
   * one figure decides it. It was `3.5rem` written into a Tailwind class in
   * TopBar.tsx and nowhere else, which was fine while the web was the only
   * client — a second one makes it the start of a drift, and a top bar that
   * is 56 on one platform and 52 on the other is the kind of difference
   * nobody files a bug about and everybody feels.
   */
  topBarHeight: 56,
} as const;

/** The room a fixed-header screen must leave above itself, given a safe-area inset. */
export function topBarSpace(topInset: number): number {
  return layout.topBarHeight + Math.max(0, topInset);
}

/** The room a scroll container must leave below itself, given a safe-area inset. */
export function navSpace(bottomInset: number): number {
  return layout.navHeight + Math.max(0, bottomInset) + layout.navGap;
}

/**
 * Where the layout changes shape.
 *
 * These are Tailwind's own `md` and `lg`, not new numbers — deliberately, so
 * there is one vocabulary in the markup rather than a custom set sitting
 * beside the default one and nobody sure which to reach for. Named here
 * because the tests and (from Phase 5) the native client need the same
 * figures, and because `md:` in a class list does not say *why* 768.
 *
 *   phone   < 768   one column, bottom bar
 *   tablet  >= 768  wider column, bottom bar still
 *   desktop >= 1024 side rail, no bottom bar
 */
export const breakpoints = {
  /** Tailwind `md`. Below this, the phone layout. */
  tablet: 768,
  /** Tailwind `lg`. At and above this, the side rail replaces the bottom bar. */
  desktop: 1024,
} as const;

/**
 * The widest the content column gets, per shape.
 *
 * The phone figure is the one the whole app was built around — it appears at
 * 35 call sites and is hard-coded in SwipeNav's own arithmetic — so it is
 * named here rather than repeated again.
 */
export const columns = {
  phone: 480,
  tablet: 600,
  /** Beside the rail, not the whole window: a feed line that long is unreadable. */
  desktop: 680,
} as const;

/** The side rail's width at desktop. */
export const sideNavWidth = 240;

/** Which shape a viewport width gets. */
export function shapeFor(width: number): "phone" | "tablet" | "desktop" {
  if (width >= breakpoints.desktop) return "desktop";
  if (width >= breakpoints.tablet) return "tablet";
  return "phone";
}

/**
 * How wide the content column actually is, in a viewport of this width.
 *
 * The cap for the shape, or the viewport itself when that is narrower — a
 * 390px phone gets 390, not 480.
 *
 * This is not a styling convenience: anything that MOVES the column has to
 * agree with how wide it is. SwipeNav travels the outgoing and incoming tabs
 * exactly one column apart and commits a swipe at a fraction of that
 * distance, and it had the phone figure hard-coded — so widening the column
 * at tablet left a swipe landing 120px short of the edge and needing 28% of
 * the whole WINDOW of travel to commit rather than 28% of the page.
 */
export function columnWidth(viewportWidth: number): number {
  // Non-finite falls back to the phone column rather than propagating.
  // Math.max(1, NaN) is NaN, so the obvious clamp does not catch it — and a
  // NaN here is a travel distance of NaN and a commit threshold of NaN,
  // which makes every swipe commit on the first pixel.
  if (!Number.isFinite(viewportWidth)) return columns.phone;
  const w = Math.max(1, viewportWidth);
  return Math.min(w, columns[shapeFor(w)]);
}

/**
 * The corner radii, keyed as the CSS custom properties are.
 *
 * Three, not a scale: `card` is every card and most panels, `show` is the
 * slightly rounder Show frame, and `pill` is a number large enough that the
 * ends go fully round whatever the height. Everything else in the app uses
 * Tailwind's own `rounded-2xl` and friends, which the native client will
 * express in its own terms.
 *
 * Here because they were in @theme only, so a native client would have had a
 * second copy of them — the same way the palette would have.
 */
export const radii = {
  card: 16,
  show: 18,
  /** Not a radius so much as "as round as this can go". */
  pill: 100,
} as const;

export type RadiusName = keyof typeof radii;

/** The CSS custom-property name for a radius, e.g. card -> --radius-card. */
export function radiusVarName(name: RadiusName): string {
  return `--radius-${name}`;
}

/**
 * The typeface, and the weights the app actually uses.
 *
 * The web loads Plus Jakarta Sans as a VARIABLE font through next/font, so
 * every weight in its range works without naming any of them. React Native
 * does not do that reliably: it wants one file per weight, registered by
 * name. So the weights are listed here, measured from the 1,234 font-*
 * classes in use rather than guessed.
 *
 * `black` is 900 on the web and Plus Jakarta Sans only goes to 800 — so the
 * 33 `font-black` sites are already being rendered at 800 by the variable
 * font clamping the request. Native should map it to 800 deliberately rather
 * than ask for a file that does not exist.
 */
export const fonts = {
  /** The family, as next/font and Google Fonts name it. */
  sans: "Plus Jakarta Sans",
  /** Fallbacks for the web, in order. */
  sansFallback: ["system-ui", "sans-serif"],
} as const;

/** CSS weight -> the file weight to ship on native. */
export const weights = {
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extrabold: 800,
  /** 900 clamps to 800: the family has nothing heavier. */
  black: 800,
} as const;

export type WeightName = keyof typeof weights;

/** The distinct font files a native client has to bundle. */
export function nativeFontWeights(): number[] {
  return [...new Set(Object.values(weights))].sort((a, b) => a - b);
}

/** The CSS custom-property name for a colour, e.g. accentInk -> --color-accent-ink. */
export function cssVarName(name: ColorName): string {
  return `--color-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}
