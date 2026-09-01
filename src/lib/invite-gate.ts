/**
 * Shared-code gate for app.hypefy.chat while Hypefy is pre-launch.
 *
 * The public site is hypefy.chat (a separate project); this app is meant to
 * be reachable only by people who have been handed the code. Vercel's own
 * Password Protection needs a paid plan, and its SSO would lock out the
 * native WebView and every tester, so the gate lives here instead.
 *
 * The cookie stores an HMAC of the current code rather than the code
 * itself, so rotating APP_INVITE_CODE invalidates every issued cookie
 * without any extra bookkeeping.
 *
 * Runs inside the proxy (edge), so Web Crypto only — no node:crypto.
 */

export const GATE_COOKIE = "hypefy_invite";

/** 30 days. Long enough that testers are not re-prompted constantly. */
export const GATE_MAX_AGE = 60 * 60 * 24 * 30;

/**
 * Paths that must answer before the gate does.
 *
 * `/api/push` and `/api/oneshot/reap` are called by Supabase pg_cron via
 * pg_net, not by a browser — gating them would silently stop push
 * notifications and OneShot expiry. Both already carry their own shared
 * secret, so they lose nothing by being exempt.
 *
 * `/auth/callback` must stay open or the OAuth round-trip cannot complete
 * for someone who already passed the gate in a different tab.
 */
const OPEN_PATHS = [
  "/gate",
  "/api/gate",
  "/auth/callback",
  "/api/push",
  "/api/oneshot/reap",

  // The legal pages are public by obligation, not convenience. Google's
  // OAuth consent screen, both app stores, and the DPDP Act all require a
  // privacy notice anyone can read without an account — gating these would
  // fail a Google verification review and a Play listing alike.
  "/privacy",
  "/terms",
  "/guidelines",
];

const OPEN_PREFIXES = ["/_next/", "/icons/", "/onboarding/"];

const OPEN_FILES = [
  "/favicon.ico",
  "/manifest.webmanifest",
  "/sw.js",
  "/offline.html",
];

export function isOpenPath(pathname: string): boolean {
  if (OPEN_PATHS.includes(pathname)) return true;
  if (OPEN_FILES.includes(pathname)) return true;
  if (OPEN_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  // Static assets served straight out of /public.
  return /\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest)$/.test(
    pathname,
  );
}

/** True when the gate is switched off entirely (no code configured). */
export function isGateDisabled(): boolean {
  return !process.env.APP_INVITE_CODE;
}

const encoder = new TextEncoder();

/**
 * HMAC-SHA256 of the invite code under INVITE_COOKIE_SECRET, hex encoded.
 * Falls back to the code itself as the key if no secret is set — weaker,
 * but it keeps a misconfigured deploy working rather than locking everyone
 * out of their own app.
 */
export async function expectedToken(code: string): Promise<string> {
  const secret = process.env.INVITE_COOKIE_SECRET || code;

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(code));

  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Length-independent, timing-safe comparison. Both inputs are hex digests
 * of fixed length in practice, but an attacker controls the cookie, so the
 * length check is done without an early return.
 */
export function safeEqual(a: string, b: string): boolean {
  const max = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < max; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/** Does this request already carry a valid gate cookie? */
export async function hasValidGateCookie(
  cookieValue: string | undefined,
): Promise<boolean> {
  const code = process.env.APP_INVITE_CODE;
  if (!code) return true; // gate disabled
  if (!cookieValue) return false;
  return safeEqual(cookieValue, await expectedToken(code));
}
