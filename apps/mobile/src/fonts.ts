/**
 * The font files this app bundles, and what they are registered as.
 *
 * Five static faces, which is what React Native wants: one registered
 * family per weight. The web loads Plus Jakarta Sans as a VARIABLE font
 * through next/font with no weight list, so every weight it uses works
 * without naming any — but a variable face with `fontWeight: "600"` is
 * unreliable across Android versions, so the web's single file becomes
 * five here.
 *
 * All five come from the same upstream the two originals did —
 * github.com/tokotype/PlusJakartaSans, `fonts/ttf` — which is how they
 * match: the sizes of ExtraBold and Medium are byte-for-byte what that
 * repository serves, so the three added beside them are the same cut of
 * the same design rather than a lookalike. OFL-licensed, and OFL.txt sits
 * beside the files as that requires.
 *
 * Previously only ExtraBold and Medium were here (they are the two satori
 * needs for the OpenGraph card), so six web weights collapsed onto two and
 * everything at 600 or 700 rendered at 800. That made the app read heavier
 * than the site in a way no layout work could fix — weight is the most
 * visible thing about type.
 *
 * `tests/mobile-foundation.test.ts` — "every family named is one that is
 * actually bundled" — fails the moment a weight in theme.ts points at a
 * family that is not in this map, so renaming a face or adding a sixth
 * cannot quietly break a weight. (An earlier version of this comment, and
 * of theme.ts, pointed at a mobile-theme test file that has never existed.
 * The guarantee was real; the pointer was not — which is why the suite now
 * checks that a comment naming a test names one that is there.)
 */

import regular from "../assets/fonts/PlusJakartaSans-Regular.ttf";
import medium from "../assets/fonts/PlusJakartaSans-Medium.ttf";
import semiBold from "../assets/fonts/PlusJakartaSans-SemiBold.ttf";
import bold from "../assets/fonts/PlusJakartaSans-Bold.ttf";
import extraBold from "../assets/fonts/PlusJakartaSans-ExtraBold.ttf";

/** Registered family name -> the bundled file. */
export const fontAssets = {
  "PlusJakartaSans-Regular": regular,
  "PlusJakartaSans-Medium": medium,
  "PlusJakartaSans-SemiBold": semiBold,
  "PlusJakartaSans-Bold": bold,
  "PlusJakartaSans-ExtraBold": extraBold,
} as const;

/** The names expo-font will know, for anything that needs to check. */
export type RegisteredFamily = keyof typeof fontAssets;
