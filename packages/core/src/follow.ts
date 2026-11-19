/**
 * Following someone, as the three states it actually has.
 *
 * "Requested" is the one that makes this worth sharing. A private account
 * turns a follow into a request, and the RPC says which happened in its
 * return value — so a client that assumes "follow succeeded means
 * following" shows "Following" for a request nobody has accepted, and the
 * person then wonders why they still cannot see anything.
 *
 * The web's own note on the failure that matters: a follow that silently
 * reverts is the one that quietly produces an empty feed later, so it has
 * to be said out loud rather than swallowed.
 */

export type FollowState = "none" | "following" | "requested";

/**
 * What to show immediately, before the RPC has answered.
 *
 * Following, optimistically — even for a private account, where the real
 * answer will be "requested". That is deliberate and is what the web does:
 * the correction arrives in the same breath, and showing "Requested"
 * first would be a guess about the other person's privacy setting made
 * from a profile row that may be stale.
 */
export function optimisticFollow(state: FollowState): FollowState {
  return state === "none" ? "following" : "none";
}

/**
 * The state after `follow_user` answers.
 *
 * The RPC returns the string "requested" when the target is private.
 * Anything else means the follow row exists.
 */
export function settleFollow(raw: unknown): FollowState {
  return raw === "requested" ? "requested" : "following";
}

/**
 * Which RPC a tap should call, given where it starts.
 *
 * `unfollow_user` covers both unfollowing and cancelling a request, which
 * is why this is a function rather than two branches at each call site —
 * the three states collapse to two actions, and getting that wrong leaves
 * a pending request with no way to withdraw it.
 */
export function followAction(state: FollowState): "follow_user" | "unfollow_user" {
  return state === "none" ? "follow_user" : "unfollow_user";
}

/**
 * What the button says.
 *
 * `followLabel` differs by surface on the web — a feed card says
 * "Follow", a profile may say something else — so it is a parameter
 * rather than a constant here.
 */
export function followLabel(state: FollowState, whenNone = "Follow"): string {
  if (state === "following") return "Following";
  if (state === "requested") return "Requested";
  return whenNone;
}

/**
 * Whether a private account's content is hidden from this viewer.
 *
 * The owner always sees their own, and a follower sees it; a pending
 * REQUEST does not count, which is the whole point of the request. Taking
 * `state` rather than a boolean is what makes that explicit.
 */
export function isLocked(args: {
  isPrivate: boolean;
  isOwn: boolean;
  state: FollowState;
}): boolean {
  if (args.isOwn) return false;
  if (!args.isPrivate) return false;
  return args.state !== "following";
}
