/**
 * Swiping a message.
 *
 * Four gestures, mirrored around whose message it is:
 *
 *            your own                 theirs
 *   right    reply                    forward
 *   left     edit (45 minutes)        reply
 *
 * Reply is on the outward swipe either way — away from the bubble's own
 * side — so it is the same physical movement in a one-to-one however the
 * thread is arranged. The other direction carries the thing you can only
 * do to that kind of message: your own words can be changed, somebody
 * else's can only be passed on.
 *
 * Every gesture here is also in the hold menu, which has a focusable
 * single-pointer button on every row. A swipe is a shortcut, never the only
 * way to reach something — that is the accessibility rule this thread
 * already follows and it is why the gestures could be added at all.
 */

/** How long a message of yours stays editable. */
export const EDIT_WINDOW_MS = 45 * 60 * 1000;

/** How far the bubble has to travel before letting go does anything. */
export const SWIPE_TRIGGER_PX = 56;

/** How far it can travel at all, so the thread never looks torn open. */
export const SWIPE_MAX_PX = 76;

/**
 * How far a finger moves before this is a swipe rather than a scroll.
 *
 * A thread is a vertical scroller first. Claiming the gesture on the first
 * pixel would make every flick down the conversation nudge a bubble.
 */
export const SWIPE_SLOP_PX = 12;

export type SwipeAction = "reply" | "edit";

/** The kinds whose content can actually be changed after sending. */
export function editableKind(kind: string): boolean {
  // Text is the body; an album's caption is the one part of it the server
  // will rewrite (edit_album_caption, 0088) — rewriting the whole body
  // would let a sender swap the photos somebody already saw.
  return kind === "text" || kind === "album";
}

/** How much of the edit window is left, in milliseconds. Never negative. */
export function editTimeLeft(createdAt: string, now: number): number {
  const sent = new Date(createdAt).getTime();
  if (!Number.isFinite(sent)) return 0;
  return Math.max(0, sent + EDIT_WINDOW_MS - now);
}

/**
 * May this message still be edited?
 *
 * Mirrors the rule the server now enforces, so the gesture does not offer
 * something about to be refused. The server is the one that decides —
 * a device with a wrong clock is not a licence to rewrite an old message.
 */
export function canEdit(
  m: { id: string; sender_id: string; kind: string; created_at: string; is_unsent?: boolean },
  myId: string,
  now: number,
): boolean {
  if (m.sender_id !== myId) return false;
  if (m.is_unsent) return false;
  if (!editableKind(m.kind)) return false;
  // Still on its way: there is no row to edit yet, and the id is local.
  if (m.id.startsWith("temp-")) return false;
  return editTimeLeft(m.created_at, now) > 0;
}

/**
 * What a swipe in this direction means on this message, or null for
 * nothing — in which case the row must not move at all, rather than
 * rubber-banding open on an action that is not there.
 */
export function swipeAction(
  m: {
    id: string;
    sender_id: string;
    kind: string;
    created_at: string;
    is_unsent?: boolean;
  },
  myId: string,
  direction: "left" | "right",
  now: number,
): SwipeAction | null {
  // A notice the thread printed, not something either person said.
  if (m.kind === "system") return null;
  if (m.is_unsent) return null;
  // Nothing can be replied to, edited or forwarded until the server has it:
  // reply_to_id would point at an id that only exists on this device.
  if (m.id.startsWith("temp-")) return null;

  const mine = m.sender_id === myId;
  if (mine) {
    if (direction === "right") return "reply";
    return canEdit(m, myId, now) ? "edit" : null;
  }

  // Either way on somebody else's message is reply. Forwarding used to
  // sit on the other direction, which made the gesture something you had
  // to aim: the thing you nearly always want was on one side only, and
  // getting it wrong sent a chat to somebody rather than quoting them.
  // Reply is the answer to a message; it does not need a correct half.
  // Forwarding is still a tap away in the hold menu, where it cannot be
  // reached by accident.
  return "reply";
}

/** What the revealed icon is announced as. */
export function swipeLabel(action: SwipeAction): string {
  return action === "reply" ? "Reply" : "Edit";
}

/**
 * How far the bubble has moved, for a finger that has moved `dx`.
 *
 * Up to the trigger the bubble is simply under the finger. Past it, it
 * keeps going at a third of the speed and stops at SWIPE_MAX_PX, so the
 * limit is felt as resistance rather than as a wall.
 *
 * This was `min(TRIGGER + over / 3, MAX)`, which cannot return less than
 * TRIGGER — so from the moment the gesture was claimed, at twelve pixels
 * of movement, the bubble jumped the full fifty-six and the swipe counted
 * as complete. Every drag was a snap, then a dead stretch where the finger
 * moved and nothing did, and letting go anywhere fired the action. That
 * was the chop.
 *
 * Takes the distance already made absolute; the caller owns the direction.
 */
export function swipeTravel(distance: number): number {
  const dist = Math.max(0, distance);
  const over = Math.max(0, dist - SWIPE_TRIGGER_PX);
  return Math.min(dist - (over * 2) / 3, SWIPE_MAX_PX);
}
