/**
 * Who a Show is for.
 *
 * Two values, like `notes` has had since 0006, in this product's own
 * words: everybody who could already see you, or your Hypers — the one
 * private list of people, stored in close_friends since Favourites was
 * folded into it in 0111.
 *
 * The rule itself lives in can_see_show(), not here. This is the shape
 * and its parser, which the composer, the ring and the server renders
 * all need, and which must never throw: `audience` is a text column
 * with a CHECK, but a row written by a newer client than this one has
 * to read as something rather than take the page down.
 */

export const SHOW_AUDIENCES = ["everyone", "hypers"] as const;

/**
 * How long a Show stays up.
 *
 * Two for now, and the CHECK on shows.lifetime_hours says the same two —
 * a third is a line here, a line there and a dropdown entry.
 *
 * The hours are what the client sends; expires_at is computed from them
 * by a trigger (0212), so a browser cannot set its own expiry.
 */
export const SHOW_LIFETIMES = [24, 48] as const;

export type ShowLifetime = (typeof SHOW_LIFETIMES)[number];

/** Whatever was chosen, as a lifetime. Unknown reads as the short one. */
export function readLifetime(value: unknown): ShowLifetime {
  return SHOW_LIFETIMES.find((h) => h === value) ?? 24;
}

export type ShowAudience = (typeof SHOW_AUDIENCES)[number];

/** Whatever the column held, as an audience. Unknown reads as the open one. */
export function readAudience(value: unknown): ShowAudience {
  return SHOW_AUDIENCES.find((a) => a === value) ?? "everyone";
}

/**
 * Whether a Show went to a narrower room than everybody.
 *
 * The ring and the grid both want this rather than the value itself:
 * what they draw is "this one is not public", and a third audience
 * later should light the same ring rather than need finding again.
 */
export function isRestricted(audience: unknown): boolean {
  return readAudience(audience) !== "everyone";
}
