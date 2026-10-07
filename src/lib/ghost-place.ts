/**
 * Ghost Share, on the receiving side: lifting one item into a feed.
 *
 * Someone who follows this person, and is followed back, chose a Shot or a
 * post for them to see. The feed has already been ranked the ordinary way.
 * This moves that one item near the top and touches nothing else, so the
 * most it can cost the feed is one off-interest item among the first three.
 *
 * The person whose feed it is is not told, unless they hype it (see
 * GhostRise, which asks the database at that moment and not before).
 * Nothing here marks the item: it
 * comes out the same object, with the same fields, as any other in the list.
 * That is the feature, and it is also why this function must never add a
 * flag "for debugging".
 */

/** How many places from the top count as "near the top". */
const NEAR_TOP = 3;

/** A small, stable number from an id: the same item always takes the same slot. */
function slotSeed(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Place `ghost` second or third in `feed`.
 *
 *   - Already within the first three: the feed is returned as it is. It got
 *     there on its own, and moving it would only make the order look odd.
 *   - Elsewhere in the feed: moved up, not duplicated.
 *   - Not in the feed at all: added.
 *
 * Never first. One item pinned to the very top of every visit is a pattern
 * someone notices; second or third is where a good recommendation lands
 * anyway. Which of the two is decided by the item's id, so drawing the page
 * again within the same visit does not shuffle it.
 */
export function placeGhost<T extends { id: string }>(feed: T[], ghost: T | null | undefined): T[] {
  if (!ghost) return feed;
  const at = feed.findIndex((x) => x.id === ghost.id);
  if (at >= 0 && at < NEAR_TOP) return feed;

  // The feed's own copy, if it has one: it is the one that was scored.
  const item = at >= 0 ? feed[at] : ghost;
  const rest = at >= 0 ? feed.filter((x) => x.id !== ghost.id) : feed;
  // Second or third; in a feed too short for that, as near as it allows.
  const slot = Math.min(rest.length, 1 + (slotSeed(ghost.id) % 2));
  return [...rest.slice(0, slot), item, ...rest.slice(slot)];
}
