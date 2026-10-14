/**
 * Profile card — the shareable view behind an expanded avatar.
 *
 * One card, two faces. The front is the person; the back is their Hypefy ID
 * — the code that opens the account, the number that names it, the date it
 * started, and one line about who they are.
 *
 * There used to be seven layouts and six background gradients. Both are
 * gone. Seven layouts meant the card you met on someone else's profile was
 * a different object every time, and a coloured bloom over an ink ramp is
 * what every dark-mode card in every app looks like — it reads as a default
 * rather than as anything of ours. The card is now one machined black
 * plate, and the only colour on it is the painted edge along the bottom,
 * which takes the owner's accent. They already chose that colour once; the
 * card does not need to ask again.
 */

/* ── Links ───────────────────────────────────────────────────────────────── */

/** Hard cap, matching the profile_links_limit trigger in the database. */
export const MAX_LINKS = 8;

export type ProfileLink = {
  id: string;
  label: string;
  url: string;
  position: number;
};

/* ── Addresses ───────────────────────────────────────────────────────────── */

/**
 * Where a scanned card lands. Not the apex: hypefy.chat is the marketing
 * site, and /u/ is open on the app host specifically so a shared profile
 * is readable without an invite code.
 */
export const APP_ORIGIN = "https://app.hypefy.chat";

export function profileUrl(username: string | null): string {
  return username ? `${APP_ORIGIN}/u/${username}` : APP_ORIGIN;
}

/**
 * Only http(s) survives. The database rejects anything else on write, but
 * rows predating that constraint — or a URL that slipped through a future
 * migration — must never reach an anchor's href as javascript: or data:.
 */
export function safeHref(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** "https://example.com/shop?x=1" -> "example.com/shop" */
export function prettyUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "");
    return `${u.hostname.replace(/^www\./, "")}${path}`;
  } catch {
    return url;
  }
}

/* ── The ID ──────────────────────────────────────────────────────────────── */

/**
 * The member number, padded to four.
 *
 * Assigned by the database in the order people finished setting up, and
 * never reissued (migration 0136). It is the one thing on the card that
 * cannot be acquired later, which is the whole reason a membership card
 * carries a number — and padding it is what makes 0002 feel like a place
 * in a queue rather than the integer two.
 *
 * Null for a profile that has not finished onboarding. The row is simply
 * left off the card rather than shown empty: a credential with a blank
 * field on it looks broken, not pending.
 */
export function memberNumber(n: number | null | undefined): string | null {
  return typeof n === "number" && n > 0 ? String(n).padStart(4, "0") : null;
}

/** "JUNE 2026" — the month, never the day. */
export function memberSince(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" }).toUpperCase();
}

/**
 * The anthem, as one line: the song and who made it.
 *
 * The featured-artist parenthetical comes off first. A row on a card is one
 * line wide, and "Confident (feat. Chance The Rapper) — Justin Bieber"
 * overran it by enough that what got cut was the artist — the half that
 * says whose song it is. The bracket is the least load-bearing part of a
 * title, so it is what gives way.
 */
export function anthemLine(anthem: unknown): string | null {
  if (!anthem || typeof anthem !== "object") return null;
  const a = anthem as { title?: unknown; artist?: unknown };
  const title = typeof a.title === "string" ? a.title.trim() : "";
  if (!title) return null;
  const short = title.replace(/\s*[([]\s*(feat|ft|with)[.\s][^)\]]*[)\]]/gi, "").trim() || title;
  const artist = typeof a.artist === "string" ? a.artist.trim() : "";
  return artist ? `${short} — ${artist}` : short;
}
