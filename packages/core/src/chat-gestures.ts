/**
 * Swiping a message.
 *
 * Right is always reply. Left carries the thing you can only do to that
 * kind of message:
 *
 *            your own                 theirs
 *   right    reply                    reply
 *   left     edit (45 minutes)        forward
 *
 * Forward on the left swipe opens the same picker as the hold menu's
 * Forward. It sends nothing by itself: a thumb going the wrong way lands on
 * a list of chats to choose from, which a tap outside closes. That is why
 * it can sit on a gesture at all. (It was once taken off the gesture for
 * fear of sending a chat by accident; Naitik asked for it back on 27 Nov
 * 2026, and the picker is the guard.)
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

export type SwipeAction = "reply" | "edit" | "forward";

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

  if (direction === "right") return "reply";
  // A view-once photo cannot be passed on: send_message refuses a oneshot
  // with no storage path, so offering it here would open a picker whose
  // every choice fails.
  return m.kind === "oneshot" ? null : "forward";
}

/** What the revealed icon is announced as. */
export function swipeLabel(action: SwipeAction): string {
  if (action === "reply") return "Reply";
  if (action === "forward") return "Forward";
  return "Edit";
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

/**
 * How far a finger may drift and still be holding.
 *
 * Under the swipe slop, so a swipe has stopped being a hold before it is
 * claimed. Was zero: any pointermove cancelled the hold timer, so a still
 * finger's jitter killed it and the browser's own long-press (contextmenu)
 * opened the menu later instead, whatever the gesture had become.
 */
export const HOLD_SLOP_PX = 8;

/** Has the finger moved far enough that this is no longer a hold? */
export function holdMoved(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) > HOLD_SLOP_PX;
}

/**
 * Should the browser's contextmenu event open the hold menu?
 *
 * Only for a mouse (right-click) or no pointer at all (the keyboard's menu
 * key). Android fires contextmenu on a long touch even when that touch went
 * on to be a swipe, which is how swiping an attachment opened the menu
 * (27 Nov 2026). A touch or pen holds through the timer alone.
 */
export function contextMenuOpensHold(pointerType: string | null): boolean {
  return pointerType === null || pointerType === "mouse";
}
