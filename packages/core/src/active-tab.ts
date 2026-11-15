/**
 * Which tab the bottom bar lights up.
 *
 * It used to read the path and nothing else, so tapping a Shot in the home
 * feed lit the Shots tab: you had gone nowhere, and the bar said you had
 * left home. A Shot opened from the feed is still the feed. The Shots tab
 * is a different place, and you go there on purpose.
 *
 * So the bar follows the last tab you actually stood on, and reads the path
 * only when there is no such thing — a link opened cold, where there is
 * nowhere to have come from.
 *
 * Pure, and separate from the bar, because "which tab am I in" turns out to
 * be a question with more answers than it looks like it has.
 */

export type Tab = "home" | "shots" | "messages" | "profile";

/** Each tab's own root, in the order they sit in the bar. */
const ROOTS: readonly (readonly [string, Tab])[] = [
  ["/home", "home"],
  ["/shots", "shots"],
  ["/messages", "messages"],
  ["/profile", "profile"],
] as const;

/**
 * The tab a path lives under, if any.
 *
 * Matched on whole segments: /shop is not /shots and /showcase is not
 * /shows, which a startsWith would have called both.
 */
export function tabOf(pathname: string): Tab | null {
  for (const [root, tab] of ROOTS) {
    if (pathname === root || pathname.startsWith(`${root}/`)) return tab;
  }
  return null;
}

/**
 * Is this a tab's own root, rather than something opened from one?
 *
 * Exported because the bar records where you have stood, and it should be
 * reading the same list this file decides by rather than keeping a second
 * copy of it.
 */
export function isTabRoot(pathname: string): boolean {
  return ROOTS.some(([root]) => pathname === root);
}

/**
 * The tab to light, given where you are and the last tab you stood on.
 *
 * A tab's own root is always itself — otherwise tapping Shots from home
 * would leave home lit, which is the opposite mistake.
 */
export function activeTab(pathname: string, cameFrom: Tab | null): Tab | null {
  if (isTabRoot(pathname)) return tabOf(pathname);
  return cameFrom ?? tabOf(pathname);
}
