/**
 * Where someone was going when they were asked to sign in.
 *
 * A link to a chat, a setting or the scheduled-posts list, opened signed
 * out, used to end at Home after signing in, and the place it pointed at was
 * forgotten. The proxy now notes the destination in a short-lived cookie as
 * it sends the visitor to the landing page, and whichever way they sign in
 * (password, Google, a saved account), the app goes there instead.
 *
 * A cookie and not a `?next=` on the address: the visitor passes through the
 * landing page and at least one more screen before signing in, and every
 * link along the way would have to carry it.
 *
 * The value is a path on this site and nothing else. It is written by the
 * server, but it lives in the browser, so it is checked again when read.
 */

export const RETURN_COOKIE = "hypefy_next";
/** Long enough to sign in or sign up; short enough not to surprise anyone later. */
export const RETURN_MAX_AGE_S = 15 * 60;

/** Places it makes no sense to come back to after signing in. */
const NOT_A_DESTINATION = ["/home", "/onboarding", "/signin", "/signup", "/setup-profile", "/age-check", "/gate"];

/** A same-site path worth returning to, or null. */
export function safeReturnPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let path: string;
  try {
    path = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return null;
  if (/[\u0000-\u001f]/.test(path) || path.length > 512) return null;
  const bare = path.split(/[?#]/)[0];
  if (bare === "/" || bare.startsWith("/api/") || bare.startsWith("/auth/")) return null;
  if (NOT_A_DESTINATION.some((p) => bare === p || bare.startsWith(`${p}/`))) return null;
  return path;
}

/** Read the noted destination and forget it. Browser only. */
export function takeReturnPath(): string | null {
  if (typeof document === "undefined") return null;
  const hit = document.cookie.split("; ").find((c) => c.startsWith(`${RETURN_COOKIE}=`));
  if (!hit) return null;
  document.cookie = `${RETURN_COOKIE}=; path=/; max-age=0; samesite=lax`;
  return safeReturnPath(hit.slice(RETURN_COOKIE.length + 1));
}
