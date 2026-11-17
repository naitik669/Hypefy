/**
 * The font files this app bundles, and what they are registered as.
 *
 * Only two, and that is a known gap rather than an oversight. The web loads
 * Plus Jakarta Sans as a VARIABLE font through next/font, so every weight it
 * uses works without naming any. React Native wants one registered family
 * per weight — a variable face with `fontWeight: "600"` is unreliable across
 * Android versions — so the web's single face becomes five files here.
 *
 * The repo has two: ExtraBold and Medium. They are there for satori, which
 * renders the OpenGraph profile card and needs static files. Rather than
 * reference three .ttf files that do not exist — a missing asset is a Metro
 * BUNDLING error, so the app would not start at all — the weights collapse
 * onto the nearest available face. See `family` in theme.ts.
 *
 * What that costs: the six weights the web uses render as two here. Body
 * text at 500 and 400 is right; 600 and 700 come out at 800, which reads
 * heavier than the web does. Adding the three files fans it out with no
 * other change, and tests/mobile-theme.test.ts fails the moment a weight
 * points at a family that is not in this map.
 *
 * Licensed under the OFL, and OFL.txt sits beside the files as that
 * requires.
 */

import medium from "../assets/fonts/PlusJakartaSans-Medium.ttf";
import extraBold from "../assets/fonts/PlusJakartaSans-ExtraBold.ttf";

/** Registered family name -> the bundled file. */
export const fontAssets = {
  "PlusJakartaSans-Medium": medium,
  "PlusJakartaSans-ExtraBold": extraBold,
} as const;

/** The names expo-font will know, for anything that needs to check. */
export type RegisteredFamily = keyof typeof fontAssets;
