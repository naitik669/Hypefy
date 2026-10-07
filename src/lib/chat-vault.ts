/**
 * Chat lock and the Vault: the small rules, kept where they can be tested.
 *
 *   normal   in the Messages list
 *   locked   behind the "Locked chats" row; the PIN opens it
 *   hidden   locked, and with no visible entry at all: the Vault
 *
 * A deterrent against someone holding your unlocked phone. It is not
 * encryption, and no screen may call it that.
 */

export type ChatLevel = "normal" | "locked" | "hidden";

export function levelOf(member: { locked_at?: string | null; hidden_at?: string | null }): ChatLevel {
  if (!member.locked_at) return "normal";
  return member.hidden_at ? "hidden" : "locked";
}

/** What Messages may know while locked: counts, and whether anything is unread. */
export type VaultOverview = { locked: number; hidden: number; unread: boolean; hasPin: boolean };

export const NO_VAULT: VaultOverview = { locked: 0, hidden: 0, unread: false, hasPin: false };

/** vault_overview() returns one row; a failed call is "nothing to show". */
export function toVaultOverview(data: unknown): VaultOverview {
  const row = (Array.isArray(data) ? data[0] : data) as
    | { locked?: number; hidden?: number; unread?: boolean; has_pin?: boolean }
    | null
    | undefined;
  if (!row) return NO_VAULT;
  return {
    locked: row.locked ?? 0,
    hidden: row.hidden ?? 0,
    unread: !!row.unread,
    hasPin: !!row.has_pin,
  };
}

/** The chat PIN is exactly this many digits (0117). The app lock's is its own. */
export const PIN_LENGTH = 4;

/**
 * Could this search be the Vault PIN? Exactly four digits and nothing else,
 * the shape set_lock_pin accepts for chats. Anything else is only ever a search.
 */
export function looksLikePin(query: string): boolean {
  return /^[0-9]{4}$/.test(query.trim());
}

/**
 * The "Locked chats" row shows itself when Messages opens, and goes away on
 * its own: at the first scroll or touch of the list, or after this long with
 * neither. It is a reminder that the door is there, not a fixture.
 */
export const LOCKED_ROW_LINGER_MS = 6500;

/**
 * Pull-and-hold. The pull has to be held at (nearly) its full stretch for
 * this long before the Vault opens; a pull that is let go sooner is an
 * ordinary refresh.
 */
export const VAULT_HOLD_MS = 600;

/** Set while something is unlocked, so "lock on leaving" is one call, not one per page. */
const OPEN_FLAG = "hypefy.vault.open";

export function markVaultOpen() {
  try {
    sessionStorage.setItem(OPEN_FLAG, "1");
  } catch {
    /* private mode: the server's own expiry still locks it */
  }
}
export function vaultMarkedOpen(): boolean {
  try {
    return sessionStorage.getItem(OPEN_FLAG) === "1";
  } catch {
    return false;
  }
}
export function clearVaultOpen() {
  try {
    sessionStorage.removeItem(OPEN_FLAG);
  } catch {
    /* nothing to clear */
  }
}

/**
 * Is this address inside Messages? Unlocked chats stay unlocked while you
 * are; leaving for any other part of the app locks them.
 */
export function inMessages(pathname: string | null | undefined): boolean {
  return !!pathname && (pathname === "/messages" || pathname.startsWith("/messages/"));
}
