/**
 * Accounts the People page never suggests, by profile id.
 *
 * This is a display filter on one page, not a moderation action: nothing
 * about these accounts changes, they can still be found by search, visited
 * and followed. Removing an id here puts it back on /people with the next
 * deploy.
 *
 * Keyed on the profile id rather than the username, because a username can
 * be changed by its owner and an id cannot, so the filter cannot be dodged
 * or accidentally pointed at someone else.
 *
 * Two kinds of account are here (checked against the live database on
 * 27 Nov 2026):
 *
 *  - Test accounts made while building the app. Suggesting them to real
 *    people sends them to an empty profile.
 *  - Accounts using the name and photo of a real public figure, which
 *    Naitik is deciding what to do about. Suggesting them would present
 *    them as the real person. Whether they are suspended is a moderation
 *    decision for a person to make on the record; until then they are
 *    simply not promoted here.
 *
 * "@username" (member #3, display name "Username") looks like a test
 * account too but has followers and a post, so it is left in until someone
 * who knows says otherwise.
 */
export const PEOPLE_EXCLUDED_IDS: ReadonlySet<string> = new Set([
  // Test accounts
  "7cb90d02-e11f-45b0-bad7-92a2e00232a1", // @devtestclaude
  "e7f50710-b0a0-4af2-927f-36d3c4aed041", // @postertest
  "7cf744c8-3a5b-4ae3-859f-4a02a94b6573", // @qa_a_1782644530852
  // Under review: a real public figure's name and photo
  "d66a4861-0b57-476d-98f0-214fed7d558d", // @narendramodi
  "f85e5a50-2a4f-407b-81db-faaa12a80cf3", // @realdonaldtrump
  "21804edc-1a0e-4aec-abbe-7216ff67ab6b", // @markzuckerberg
]);
