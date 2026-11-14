/**
 * The small decisions the Insights screen makes, kept out of the JSX so
 * they can be tested as logic rather than matched as text.
 *
 * Written because a test could not tell a live branch from a dead one: the
 * page chose a Shot's link with a ternary, and blanking the condition left
 * the string "/shots?shot=" sitting in the source, so an assertion that the
 * source contained it still passed against a page that had stopped linking
 * Shots at all. A source-as-text test can prove a string is present; only a
 * called function can prove a choice is still being made.
 */

/** What creator_item_stats returns for each row's `kind`. */
export type ItemKind = "post" | "shot";

/**
 * Where a row in the list goes.
 *
 * Shots open in the reel viewer rather than at a permalink — there is no
 * /s/:id route, and sending somebody to the Shots tab with the one they
 * tapped already on screen is the behaviour the rest of the app has.
 */
export function itemHref(kind: ItemKind, id: string): string {
  return kind === "shot" ? `/shots?shot=${id}` : `/p/${id}`;
}

/** The fallback title for a row whose author wrote no caption. */
export function itemTitle(kind: ItemKind, caption: string | null): string {
  if (caption && caption.trim()) return caption;
  return kind === "shot" ? "Untitled Shot" : "Untitled post";
}

/**
 * How often the people who saw it came back: "1.4 views each".
 *
 * Views counts every time a thing was seen and reach counts the people, so
 * one person on three days is three views and one person. The ratio is the
 * only number that says which of those two stories a total is telling.
 */
export function viewsPerPerson(views: number, reach: number): string {
  if (!(reach > 0) || !(views > 0)) return "—";
  const each = views / reach;
  // Exactly one is the only case worth saying in the singular. Everything
  // else is shown to a decimal under ten, and "1.0 view each" reads like a
  // bug even though the arithmetic is right.
  if (each === 1) return "1 view each";
  const shown = each < 10 ? each.toFixed(1) : String(Math.round(each));
  return `${shown} views each`;
}
