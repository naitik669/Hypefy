import { StyleSheet } from "react-native";
import { colors, radii, layout, fonts, weights } from "@hypefy/tokens";

/**
 * The web's design tokens, as React Native styles.
 *
 * No NativeWind, and that was a decision rather than an omission. Tailwind 4
 * support lives only in NativeWind v5, which is a release candidate — but
 * the deciding reason is the architecture: this project shares LOGIC through
 * @hypefy/core and deliberately shares no UI. With no shared components, the
 * one thing NativeWind buys is shared class names between two codebases that
 * are not shared, in exchange for a second Tailwind, a release-candidate
 * dependency and a CSS pipeline inside Metro.
 *
 * So the values come from @hypefy/tokens, which is already asserted against
 * globals.css in both directions by tests/tokens.test.ts. A colour nudged on
 * the web and not here — or here and not there — fails that test. This file
 * adds no figures of its own; everything below is a token or arithmetic on
 * one, which is what keeps the two clients looking like one product.
 */

/** The palette, verbatim. Re-exported so screens import one thing. */
export const palette = colors;

/**
 * Type scale.
 *
 * These ARE new numbers, and they are the one thing in this file that is:
 * the web expresses type through Tailwind's scale, which is a set of
 * rem-based classes rather than tokens, so there is nothing to import. They
 * are the Tailwind sizes the app actually uses, in px, so the two clients
 * agree by construction rather than by eye.
 */
export const type = {
  /** text-[10px] — badges, the smallest labels. */
  tiny: 10,
  /** text-xs */
  xs: 12,
  /** text-sm — body text through most of the app. */
  sm: 14,
  /** text-base */
  base: 16,
  /** text-lg */
  lg: 18,
  /** text-xl */
  xl: 20,
  /** text-2xl */
  xxl: 24,
} as const;

/**
 * The font family name per weight.
 *
 * React Native wants one registered family per weight, not a family plus a
 * numeric weight — a variable font with `fontWeight: "600"` is unreliable
 * across Android versions, which is why the web's single variable face
 * becomes five files here. The names are what expo-font registers them as.
 *
 * `black` maps to the ExtraBold file on purpose: Plus Jakarta Sans stops at
 * 800, so the web's 33 `font-black` sites are already being rendered at 800
 * by the variable font clamping the request. Asking for a 900 file would ask
 * for one that does not exist.
 */
/*
 * Two files, so six weights collapse onto two faces for now.
 *
 * The repo has ExtraBold and Medium — they are there for satori, which
 * renders the OpenGraph card and needs static files. Referencing the other
 * three would be a Metro BUNDLING error, not a runtime one, so the app
 * would not start at all.
 *
 * What it costs: 400 and 500 are right; 600 and 700 render at 800, which
 * reads heavier than the web. Adding Regular, SemiBold and Bold fans this
 * out with no other change — every name below must appear in fonts.ts, and
 * tests/mobile-foundation.test.ts fails if one does not.
 */
export const family = {
  normal: "PlusJakartaSans-Regular",
  medium: "PlusJakartaSans-Medium",
  semibold: "PlusJakartaSans-SemiBold",
  bold: "PlusJakartaSans-Bold",
  extrabold: "PlusJakartaSans-ExtraBold",
  // 900 clamps to 800, as `weights` does: the family has nothing heavier.
  black: "PlusJakartaSans-ExtraBold",
} as const satisfies Record<keyof typeof weights, string>;

/** The CSS family name, for anywhere that wants it as a string. */
export const fontFamilyName = fonts.sans;

/**
 * What a scroll container leaves clear of the bottom bar.
 *
 * `navSpace` takes the device's own bottom inset, which on the web comes
 * from env(safe-area-inset-bottom) and here comes from
 * react-native-safe-area-context. Same function, same arithmetic, both
 * clients.
 */
export { navSpace } from "@hypefy/tokens";

/** The bar's own height, before any inset. */
export const navHeight = layout.navHeight;

/** Corner radii, as React Native numbers. */
export const radius = radii;

/**
 * The handful of styles every screen needs.
 *
 * Deliberately small. A shared stylesheet that grows into a component
 * library is how the "no shared UI" rule gets broken from the inside — each
 * screen builds its own StyleSheet from the tokens above.
 */
export const base = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centre: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  title: {
    color: colors.foreground,
    fontFamily: family.extrabold,
    fontSize: type.xxl,
    letterSpacing: -0.5,
  },
  body: {
    color: colors.muted,
    fontFamily: family.medium,
    fontSize: type.sm,
    textAlign: "center",
  },
});
