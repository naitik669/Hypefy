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

/**
 * The shared name wins over the private one.
 *
 * Two kinds of nickname live side by side. The private one (0169) is what
 * you alone call someone; the shared one (0176) is what the whole chat
 * calls them, announced in the thread when it changes. Shared wins,
 * because a chat whose members disagree about who they are reading is the
 * one thing a shared name exists to prevent — a private label that
 * silently outranked it would make the announcement a lie.
 *
 * The private one is still honoured where no shared name exists, so a
 * label somebody set before any of this shipped keeps working rather than
 * disappearing out from under them.
 */
export function mergeNicknames(shared: Nicknames, personal: Nicknames): Nicknames {
  return { ...personal, ...shared };
}

/**
 * A nickname as it will be stored.
 *
 * Mirrors what set_shared_nickname does to the same string, so what the
 * field shows after saving is what the chat is about to see. Runs of
 * whitespace — newlines among them — come down to one space: the name is
 * drawn on a single line beside an avatar, and 40 characters of newline
 * is a way to push the rest of a row off it.
 */
export function tidyNickname(raw: string): string {
  return raw.replace(/[\s\u0000-\u001f\u007f]+/g, " ").trim().slice(0, 40);
}
