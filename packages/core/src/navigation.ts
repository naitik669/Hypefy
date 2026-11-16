import type { Tab } from "@hypefy/core/active-tab";

/**
 * Where you can go, as data.
 *
 * The phone's bottom bar held this list inline, which was fine while there
 * was one navigation. A desktop side rail makes it two, and two copies of a
 * navigation drift: a destination gets added to one, and the other quietly
 * offers less. So the list lives here and both read it.
 *
 * Data only — no icons. An icon is a React component and this module is in
 * core, which the Expo app will import; each client maps `tab` (or `href`)
 * to its own icon set.
 *
 * Note what the desktop rail is FOR, beyond being wider. Four destinations
 * on the phone are reachable only by holding a tab down — Search,
 * Marketplace, Library, Settings, in NavHoldMenu — and a mouse cannot hold.
 * Right-click is wired as an alias, but nobody discovers a right-click menu.
 * On a wide screen there is room to simply show them, so the rail is not a
 * stretched bottom bar; it is the bottom bar plus the things the bottom bar
 * had to hide.
 */

export type Destination = {
  /**
   * The tab this lights up, when it is one of the four.
   *
   * Null for destinations that are not tabs — Discover has never had one,
   * which is why it was reachable only by swiping right from Home.
   */
  tab: Tab | null;
  label: string;
  href: string;
  /** In the phone's bottom bar. */
  bottomBar: boolean;
  /** In the wide-screen side rail. */
  sideNav: boolean;
};

export const DESTINATIONS: readonly Destination[] = [
  { tab: "home", label: "Home", href: "/home", bottomBar: true, sideNav: true },
  // No tab, and no bottom-bar slot. On a phone it is reached by the compass
  // in the top bar or by swiping right; on a wide screen it gets a real
  // entry, because neither of those works with a mouse.
  { tab: null, label: "Discover", href: "/discover", bottomBar: false, sideNav: true },
  { tab: "shots", label: "Shots", href: "/shots", bottomBar: true, sideNav: true },
  { tab: "messages", label: "Messages", href: "/messages", bottomBar: true, sideNav: true },
  { tab: "profile", label: "Profile", href: "/profile", bottomBar: true, sideNav: true },

  // Hidden behind a long-press on the phone; shown outright on a wide screen.
  { tab: null, label: "Search", href: "/search", bottomBar: false, sideNav: true },
  { tab: null, label: "Library", href: "/library", bottomBar: false, sideNav: true },
  { tab: null, label: "Marketplace", href: "/marketplace", bottomBar: false, sideNav: true },
  { tab: null, label: "Settings", href: "/settings", bottomBar: false, sideNav: true },
] as const;

/** The phone's bottom bar, in order. */
export function bottomBarDestinations(): Destination[] {
  return DESTINATIONS.filter((d) => d.bottomBar);
}

/** The wide-screen rail, in order. */
export function sideNavDestinations(): Destination[] {
  return DESTINATIONS.filter((d) => d.sideNav);
}

/**
 * Which destination a path belongs to, for highlighting.
 *
 * Whole segments, not startsWith: /shop is not /shots and /showcase is not
 * /shows, which a prefix match would call both. The same rule active-tab.ts
 * applies, for the same reason.
 */
export function destinationFor(pathname: string): Destination | null {
  // Longest href first, so /messages/new prefers /messages over /, and a
  // future nested destination wins over its parent.
  const byLength = [...DESTINATIONS].sort((a, b) => b.href.length - a.href.length);
  return (
    byLength.find((d) => pathname === d.href || pathname.startsWith(`${d.href}/`)) ?? null
  );
}
