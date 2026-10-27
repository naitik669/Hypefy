/**
 * What you call someone, in one chat.
 *
 * Personal, never shared: the table's RLS lets only the owner read a row,
 * so nobody ever sees what you called them. That is deliberate and it is
 * the schema rather than a policy decision — a nickname everybody sees is
 * user-written text about another person, which needs reporting, takedown
 * and somebody to action it. See 0169.
 *
 * Pure, so the question "what name goes here" has one answer and every
 * surface that asks gets the same one.
 */

/** A chat's nicknames, by the id of the person they are for. */
export type Nicknames = Readonly<Record<string, string>>;

/**
 * The name to draw for someone in a thread.
 *
 * Never blank. An avatar takes its initial from this, and an empty string
 * has none — so a profile with no display name still gets a label rather
 * than a hole. A nickname that is only spaces is not a nickname.
 */
export function displayNameFor(
  userId: string,
  fallback: string | null | undefined,
  nicknames: Nicknames,
): string {
  const nick = nicknames[userId]?.trim();
  if (nick) return nick;
  return fallback?.trim() || "Someone";
}
