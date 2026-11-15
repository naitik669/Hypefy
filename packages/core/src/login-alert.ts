/**
 * Bits the login alert needs, kept pure so they can be tested.
 */

/**
 * The session id a token was issued for, or null.
 *
 * It is stable for the life of a session across refreshes, which is what makes
 * "have I seen this one before" a workable definition of a new sign-in.
 *
 * Decoded, not verified — the caller has already validated this token.
 */
export function readSessionId(accessToken: string | undefined | null): string | null {
  if (!accessToken) return null;
  try {
    const payload = accessToken.split(".")[1];
    if (!payload) return null;
    const json = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    ) as { session_id?: string };
    return json.session_id ?? null;
  } catch {
    return null;
  }
}

/**
 * A coarse "Chrome on Windows" from a user agent.
 *
 * Coarse on purpose. This ends up in a notification row the user can read and
 * in a push payload, so it must be enough to recognise your own sign-in and
 * not enough to be worth harvesting. No IP, no version numbers, no full UA
 * string.
 */
export function deviceLabel(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  if (!ua) return "";

  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : // Safari last: Chrome and Edge both carry "Safari" in their UA, so
            // testing for it earlier would label most of the web as Safari.
            /Safari\//.test(ua)
            ? "Safari"
            : "";

  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : // iPad reports as Macintosh in desktop mode, so iOS is checked first.
        /iPhone|iPad|iPod/.test(ua)
        ? "iOS"
        : /Mac OS X|Macintosh/.test(ua)
          ? "Mac"
          : /Linux/.test(ua)
            ? "Linux"
            : "";

  if (browser && os) return `${browser} on ${os}`;
  return browser || os;
}
