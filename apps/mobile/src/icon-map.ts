import type { ComponentProps } from "react";
import type Ionicons from "@expo/vector-icons/Ionicons";

/**
 * Which icon each destination gets, as data.
 *
 * Split from `icons.tsx` for the same reason `@hypefy/core/navigation` has
 * no icons in it: a module that imports a React Native component cannot be
 * read by a test running under Node. Both imports here are `import type`,
 * which TypeScript erases, so this file keeps the full name checking —
 * a typo like "chatbubles" fails the build — while staying importable from
 * `tests/mobile-navigation.test.ts`.
 *
 * **Known gap.** The web draws these with Phosphor (House, Lightning, Chat)
 * and this uses Ionicons, which ships inside Expo and needs no native
 * module. The shapes are close but not identical, so the two clients are
 * not yet pixel-matched in the nav.
 *
 * That was a cost decision rather than a preference: Phosphor on React
 * Native needs `react-native-svg`, every dependency added before the
 * screens exist is one more way to break a build nobody can debug without
 * a device, and the icon set is the most swappable choice in the app. When
 * `react-native-svg` arrives for something that genuinely needs it — the
 * avatar ring, Shots' scrubber — the swap is this file and no call site.
 */

export type IoniconName = ComponentProps<typeof Ionicons>["name"];

/**
 * Destination href -> the filled and outline faces of its icon.
 *
 * Keyed by `href` rather than by `tab`, because five of the nine
 * destinations have no tab: Discover never had one, and Search, Library,
 * Marketplace and Settings are long-press-only on the phone.
 */
export const ICONS: Readonly<Record<string, { readonly on: IoniconName; readonly off: IoniconName }>> =
  {
    // Phosphor House.
    "/home": { on: "home", off: "home-outline" },
    // Phosphor Lightning. The web's Shots mark is a bolt rather than a play
    // triangle on purpose, and this is the closest Ionicon by silhouette.
    "/shots": { on: "flash", off: "flash-outline" },
    // Phosphor Chat.
    "/messages": { on: "chatbubble", off: "chatbubble-outline" },
    // The web shows the user's own Avatar here, not an icon. This stands in
    // until avatars load on native, and is the one entry that is not a
    // like-for-like translation.
    "/profile": { on: "person-circle", off: "person-circle-outline" },
    "/discover": { on: "compass", off: "compass-outline" },
    "/search": { on: "search", off: "search-outline" },
    "/library": { on: "library", off: "library-outline" },
    "/marketplace": { on: "bag", off: "bag-outline" },
    "/settings": { on: "settings", off: "settings-outline" },
  };

/**
 * A destination added to core but not mapped here renders as a plain dot.
 *
 * A crash, or a blank space where a tab should be, is a worse answer to
 * "somebody added a destination and forgot this file" — and the test fails
 * on exactly that condition, so the gap is caught in CI rather than found
 * on a device.
 */
export const FALLBACK = { on: "ellipse", off: "ellipse-outline" } as const;

export function iconFor(href: string, focused: boolean): IoniconName {
  const pair = ICONS[href] ?? FALLBACK;
  return focused ? pair.on : pair.off;
}

/** Every href this file knows about. */
export function mappedHrefs(): string[] {
  return Object.keys(ICONS).sort();
}
