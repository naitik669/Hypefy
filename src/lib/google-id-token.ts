/**
 * Google sign-in that never goes through the Supabase domain.
 *
 * With signInWithOAuth, Google's redirect_uri is
 * https://<project-ref>.supabase.co/auth/v1/callback, and Google names that
 * redirect's host on its sign-in screen: "to continue to
 * fyaioseridqabockidyp.supabase.co". Measured on 27 Nov 2026 by opening the
 * live flow. It is the first screen a new user sees, and it reads as a
 * phishing page. It also blocks Google's brand verification, which wants
 * every domain in the OAuth project to be one we own, and we cannot own
 * supabase.co.
 *
 * So the website asks Google for an ID token directly, with our own page as
 * the redirect_uri, and hands the token to Supabase with signInWithIdToken.
 * Supabase still verifies the token (signature, audience, nonce); only the
 * leg the user can see moves to hypefy.chat. Supabase documents this as a
 * supported way to sign in with Google.
 *
 * Off unless NEXT_PUBLIC_GOOGLE_CLIENT_ID is set, because Google rejects the
 * request until <origin>/auth/google is listed as an authorised redirect URI
 * on that client. Set it only where that URI is registered (Production).
 * Everywhere else the old redirect flow still runs.
 *
 * Website only. The native shell keeps its Custom Tab flow
 * (src/lib/native-auth.ts), and the Expo app is on hold. Both need a native
 * Google sign-in, not this page, so this difference has a platform reason.
 */

const STORE_KEY = "hypefy_google_id_token";
/** Long enough for a slow consent screen, short enough that an abandoned
 *  attempt cannot be finished by a stale page much later. */
const TTL_MS = 10 * 60 * 1000;

export const GOOGLE_RETURN_PATH = "/auth/google";

export type PendingGoogle = { state: string; nonce: string; at: number };

export function googleClientId(): string | null {
  const id = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  return id && id.trim() ? id.trim() : null;
}

/** The authorisation URL. Pure, so the test drives it. */
export function buildGoogleAuthUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
  hashedNonce: string;
}): string {
  const p = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    // An ID token straight back in the fragment. No client secret is
    // involved, and the fragment never reaches a server log.
    response_type: "id_token",
    scope: "openid email profile",
    state: opts.state,
    // Google copies this into the token's nonce claim unchanged. Supabase
    // hashes the raw nonce we give it and compares, so Google gets the hash.
    nonce: opts.hashedNonce,
    // Adding a second account has to be able to pick a different one.
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

export type GoogleReturn =
  | { ok: true; token: string; nonce: string }
  | { ok: false; reason: string };

/**
 * Reads what Google sent back. Pure: the page passes in the fragment, what it
 * stored before leaving, and the time.
 */
export function parseGoogleReturn(
  hash: string,
  pending: PendingGoogle | null,
  now: number,
): GoogleReturn {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const error = params.get("error");
  if (error) return { ok: false, reason: error };
  if (!pending) return { ok: false, reason: "no_pending_request" };
  if (now - pending.at > TTL_MS) return { ok: false, reason: "expired" };
  // A token that answers someone else's request is refused: this is what
  // stops a link carrying an attacker's token from signing a victim in to
  // the attacker's account.
  if (params.get("state") !== pending.state) {
    return { ok: false, reason: "state_mismatch" };
  }
  const token = params.get("id_token");
  if (!token) return { ok: false, reason: "no_token" };
  return { ok: true, token, nonce: pending.nonce };
}

function randomString(bytes = 32): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

export function readPendingGoogle(): PendingGoogle | null {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as PendingGoogle) : null;
  } catch {
    return null;
  }
}

export function clearPendingGoogle() {
  try {
    sessionStorage.removeItem(STORE_KEY);
  } catch {
    /* nothing to do */
  }
}

/** Leaves for Google. Returns an error message if it could not. */
export async function startGoogleIdTokenSignIn(
  clientId: string,
): Promise<string | null> {
  const state = randomString();
  const nonce = randomString();
  try {
    // sessionStorage, not localStorage: the return lands in this same tab,
    // and a nonce has no business outliving it.
    sessionStorage.setItem(
      STORE_KEY,
      JSON.stringify({ state, nonce, at: Date.now() } satisfies PendingGoogle),
    );
  } catch {
    return "Your browser blocked sign-in storage. Try again outside private mode.";
  }
  const url = buildGoogleAuthUrl({
    clientId,
    redirectUri: `${window.location.origin}${GOOGLE_RETURN_PATH}`,
    state,
    hashedNonce: await sha256Hex(nonce),
  });
  window.location.assign(url);
  return null;
}
