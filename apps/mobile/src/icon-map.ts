// Relative, not the `@/` alias: this module is also compiled by the ROOT
// tsconfig, because tests/mobile-navigation.test.ts imports it, and `@/`
// there means the web's src. Relative resolves the same from both.
import type { PhosphorIconName } from "./phosphor-paths";

/**
 * Which icon each destination gets, as data.
 *
 * Split from `icons.tsx` for the same reason `@hypefy/core/navigation` has
 * no icons in it: a module that imports a React Native component cannot be
 * read by a test running under Node. The import here is `import type`,
 * which TypeScript erases, so this file keeps full name checking while
 * staying importable from `tests/mobile-navigation.test.ts`.
 *
 * **These are the web's icons, not lookalikes.** The bottom bar draws
 * Phosphor — House, Lightning, Chat — and the path data is lifted from the
 * package the web itself depends on (see phosphor-paths.ts). The compass in
 * the top bar is Lucide's, from `lucide-react-native` pinned to the same
 * 1.17.0 the web's `lucide-react` is on, so the geometry is identical
 * rather than similar.
 *
 * An earlier version of this file used Ionicons because they ship inside
 * Expo and needed no native module. They were the right silhouettes and the
 * wrong shapes, and "the app should not be distinguishable from the site"
 * makes that the wrong trade.
 */

/** How a destination's icon is drawn. */
export type IconSpec =
  /** From Phosphor's 256-grid path data, filled when the tab is active. */
  | { readonly kind: "phosphor"; readonly name: PhosphorIconName }
  /** A Lucide component, stroked, matching the web's lucide-react. */
  | { readonly kind: "lucide"; readonly name: LucideIconName }
  /** The viewer's own avatar — an image, not an icon. See icons.tsx. */
  | { readonly kind: "avatar" };

/**
 * Lucide names used here, as a closed union.
 *
 * Narrow on purpose: a typo in a Lucide name is otherwise a missing icon at
 * runtime, and the component map in icons.tsx has to list each one anyway
 * because React Native has no dynamic import of a tree-shaken module.
 */
export type LucideIconName = "Compass" | "Search" | "Library" | "ShoppingBag" | "Settings";

/**
 * Destination href -> how to draw it.
 *
 * Keyed by `href` rather than by `tab`, because five of the nine
 * destinations have no tab: Discover never had one, and Search, Library,
 * Marketplace and Settings are long-press-only on the phone.
 */
export const ICONS: Readonly<Record<string, IconSpec>> = {
  // The four tabs, Phosphor, exactly as BottomNav.tsx draws them.
  "/home": { kind: "phosphor", name: "House" },
  "/shots": { kind: "phosphor", name: "Lightning" },
  "/messages": { kind: "phosphor", name: "Chat" },
  // The web shows the viewer's Avatar in this slot, not an icon. Until
  // profiles load on native, icons.tsx draws a neutral ring in its place —
  // recorded as "avatar" rather than mislabelled as an icon so the slot is
  // obviously unfinished rather than quietly wrong.
  "/profile": { kind: "avatar" },

  // Lucide, which is what the web uses for all of these. The compass is
  // the one that matters today: it is the only way to reach Discover.
  "/discover": { kind: "lucide", name: "Compass" },
  "/search": { kind: "lucide", name: "Search" },
  "/library": { kind: "lucide", name: "Library" },
  "/marketplace": { kind: "lucide", name: "ShoppingBag" },
  "/settings": { kind: "lucide", name: "Settings" },
};

/**
 * A destination core knows about but this file does not.
 *
 * `tests/mobile-navigation.test.ts` fails on exactly that condition, so the
 * gap is caught in CI rather than found on a device — but if one ever
 * shipped, an outline circle is a better answer than a crash or a hole in
 * the bar.
 */
export const FALLBACK: IconSpec = { kind: "lucide", name: "Compass" };

export function specFor(href: string): IconSpec {
  return ICONS[href] ?? FALLBACK;
}

/** Every href this file knows about. */
export function mappedHrefs(): string[] {
  return Object.keys(ICONS).sort();
}
