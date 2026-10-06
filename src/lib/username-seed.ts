/**
 * A first guess at a username, from the name someone just typed.
 *
 * The guess used to be the front half of their email address. Anyone who
 * accepted it published most of their email as their handle, on a profile
 * anyone can open. The name they chose to show is theirs to show.
 *
 * Only a suggestion: it goes through the same availability check as anything
 * typed by hand, and it is there to be changed.
 */

const MAX = 20;
const MIN = 3;

export function usernameFromName(name: string): string {
  const plain = name
    // "Zoë" → "Zoe": split the accent off the letter, then drop it below.
    .normalize("NFD")
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, "")
    // A handle that starts or ends on a dot reads as a typo.
    .replace(/^\.+|\.+$/g, "")
    .slice(0, MAX);
  // Too short to be a username (a name in another script leaves nothing):
  // better an empty field than a suggestion that is already invalid.
  return plain.length >= MIN ? plain : "";
}
