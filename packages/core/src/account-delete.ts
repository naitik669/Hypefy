/**
 * Deleting an account, as one rule for both clients.
 *
 * The website's Danger zone and the phone's Account screen both arm the same
 * button with the same word, call the same route, and say the same thing when
 * it fails. Each of those used to be written inline in the web component;
 * they live here so the phone cannot drift from it, and so a test can drive
 * the whole request without a browser, a phone or a network.
 *
 * Platform-free: no React, no fetch of its own. The transport is passed in.
 */

/** The one route that deletes an account. Both clients call it. */
export const DELETE_ACCOUNT_PATH = "/api/account/delete";

/** What has to be typed to arm the button: the username, or "delete". */
export function confirmWord(username: string | null | undefined): string {
  const name = (username ?? "").trim();
  return name || "delete";
}

/** Case- and whitespace-insensitive, as the web always was. */
export function isArmed(typed: string, username: string | null | undefined): boolean {
  return typed.trim().toLowerCase() === confirmWord(username).toLowerCase();
}

/**
 * The token in an `Authorization: Bearer …` header, or null.
 *
 * The phone has no cookie jar the website can read, so it proves who it is
 * the way every Supabase client does outside a browser: with its access
 * token. Anything that is not exactly a bearer credential is ignored rather
 * than guessed at, so a malformed header falls back to the cookie path and
 * then to 401 — never to someone else's account.
 */
export function bearerToken(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header.trim());
  return match ? match[1] : null;
}

/**
 * What the person reads when deletion did not happen.
 *
 * The route's own message is used when it sent one, because it is the only
 * party that knows whether the files went (they go first, and a failure
 * there keeps the account). Two codes are machine words rather than
 * sentences and are translated here, where both clients get the same
 * translation.
 */
export function deleteErrorMessage(status: number, body: unknown): string {
  const error =
    body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
      ? ((body as { error: string }).error)
      : null;
  if (error === "mfa_required") {
    return "Confirm it's you with your authenticator code, then try again.";
  }
  if (status === 401 || error === "unauthorized") {
    return "You've been signed out. Sign in again, then try again.";
  }
  return error ?? "Deletion failed. Try again.";
}

export type DeleteResult = { ok: true } | { ok: false; error: string };

/** The slice of `fetch` this needs, so a test can stand in for it. */
export type DeleteTransport = (
  url: string,
  init: { method: "POST"; headers: Record<string, string> },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/**
 * Ask the site to delete the caller's account.
 *
 * `site` is "" on the web (same origin, the cookie carries the session) and
 * the site's origin on the phone, which also passes its access token.
 */
export async function requestAccountDeletion({
  site,
  accessToken,
  transport,
}: {
  site: string;
  accessToken?: string | null;
  transport: DeleteTransport;
}): Promise<DeleteResult> {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  let res: Awaited<ReturnType<DeleteTransport>>;
  try {
    res = await transport(`${site}${DELETE_ACCOUNT_PATH}`, { method: "POST", headers });
  } catch {
    return { ok: false, error: "Couldn't reach Hypefy. Check your connection and try again." };
  }
  if (res.ok) return { ok: true };
  const body = await res.json().catch(() => null);
  return { ok: false, error: deleteErrorMessage(res.status, body) };
}
