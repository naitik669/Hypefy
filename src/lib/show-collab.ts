/**
 * Shows several people build together.
 *
 * A collab is one cover with several people posting behind it. Each
 * Show still belongs to whoever posted it — their row, their media,
 * their hype, their takedown — and `collab_id` says which shared reel
 * it also appears in. Leaving takes your Shows out of the cover and
 * leaves the Shows themselves alone, which is only coherent because of
 * that shape.
 *
 * This file is the shape and its rules, with no DOM and no client, so
 * the composer, the collab page, the ring and the server renders all
 * ask the same questions.
 */

/** How many people one collab holds, the owner included. Mirrors show_collab_cap(). */
export const COLLAB_CAP = 20;

/** The longest a shared Show's name can be. Mirrors the column's CHECK. */
export const MAX_COLLAB_TITLE = 60;

/**
 * A name as the database will store it.
 *
 * Whitespace and control characters collapse to single spaces: the
 * title is drawn on one line over a cover, and sixty characters of
 * newline is a way to push everything else off it. The same transform
 * create_show_collab applies, so the composer can tell somebody their
 * name is empty before the round trip rather than after it.
 */
export function tidyCollabTitle(raw: string): string {
  return raw.replace(/[\s\u0000-\u001f\u007f]+/g, " ").trim().slice(0, MAX_COLLAB_TITLE);
}

/** Whether this name can be sent. */
export function collabTitleReady(raw: string): boolean {
  return tidyCollabTitle(raw).length > 0;
}

/** Where somebody stands with a collab. */
export type MemberState = "owner" | "member" | "invited" | "outsider";

export type CollabMember = {
  userId: string;
  joined: boolean;
};

/**
 * What this person is to this collab.
 *
 * "invited" and "member" are deliberately different: being added to
 * something without saying yes would put a cover on your ring you did
 * not ask for and list you as a contributor to whatever the others
 * post, so joining is a step.
 */
export function memberState(
  ownerId: string,
  members: readonly CollabMember[],
  viewerId: string | null,
): MemberState {
  if (!viewerId) return "outsider";
  if (viewerId === ownerId) return "owner";
  const mine = members.find((m) => m.userId === viewerId);
  if (!mine) return "outsider";
  return mine.joined ? "member" : "invited";
}

/** Whether this person may post into it. The trigger asks the same question. */
export function canPostInto(state: MemberState): boolean {
  return state === "owner" || state === "member";
}

/**
 * Whether there is room for one more.
 *
 * Counted over everybody on the list, invitations included — an
 * invitation holds a place, or a collab could be filled past the cap
 * by everybody accepting at once.
 */
export function hasRoom(members: readonly CollabMember[]): boolean {
  return members.length < COLLAB_CAP;
}

/**
 * What the cover says underneath the name.
 *
 * Names rather than a count where it fits: "Aman, dnot and 2 others" is
 * what somebody wants to know about a shared Show, and "4 people" is
 * not.
 */
export function contributorLine(names: readonly string[]): string {
  const real = names.filter((n) => n.trim().length > 0);
  if (real.length === 0) return "Nobody yet";
  if (real.length === 1) return real[0];
  if (real.length === 2) return `${real[0]} and ${real[1]}`;
  const rest = real.length - 2;
  return `${real[0]}, ${real[1]} and ${rest} other${rest === 1 ? "" : "s"}`;
}
