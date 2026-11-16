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
} as const;

/** The room a scroll container must leave below itself, given a safe-area inset. */
export function navSpace(bottomInset: number): number {
  return layout.navHeight + Math.max(0, bottomInset) + layout.navGap;
}

/** The CSS custom-property name for a colour, e.g. accentInk -> --color-accent-ink. */
export function cssVarName(name: ColorName): string {
  return `--color-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}
