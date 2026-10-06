import { createHmac } from "node:crypto";

/**
 * The servers a call uses to find a path between two phones, built on the
 * server and handed to a signed-in caller.
 *
 * They used to be built in the browser from NEXT_PUBLIC_TURN_* variables.
 * Anything with that prefix is compiled into the JavaScript every visitor
 * downloads, so the relay's username and password were readable by anyone
 * who opened the site, signed in or not, and a relay carries other people's
 * traffic at the owner's cost.
 *
 * Two ways to configure the relay, both server-only:
 *
 *   TURN_URLS + TURN_SECRET
 *       The relay's shared secret (coturn's `static-auth-secret`). Each
 *       caller gets a username and password that work for an hour and are
 *       tied to them. This is the one to use.
 *
 *   TURN_URLS + TURN_USERNAME + TURN_CREDENTIAL
 *       One fixed login, as before, but no longer in the bundle. A signed-in
 *       caller can still read it out of the response; it does not expire.
 *
 * The old NEXT_PUBLIC_ names are still read here as a fallback, so nothing
 * breaks before the variables are renamed. They only stop being public once
 * they are renamed: the build inlines them for as long as that name exists
 * and any client code mentions it, which nothing does any more.
 */

type Env = Record<string, string | undefined>;

export type IceServer = { urls: string[]; username?: string; credential?: string };

/** How long a minted login lasts. A call that runs past it keeps its path. */
export const TURN_TTL_SECONDS = 60 * 60;

const STUN: IceServer = { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] };

/** What a browser can do with no relay at all: fine on Wi-Fi, not on most mobile data. */
export const STUN_ONLY: IceServer[] = [STUN];

function list(v: string | undefined): string[] {
  return (v ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
}

/**
 * A time-limited login in the form coturn's REST scheme expects: the
 * username is "<expiry>:<who>", the password is the HMAC of that under the
 * shared secret. The relay checks both without being asked about each one.
 */
export function mintTurnLogin(secret: string, userId: string, nowMs: number, ttl = TURN_TTL_SECONDS) {
  const username = `${Math.floor(nowMs / 1000) + ttl}:${userId}`;
  const credential = createHmac("sha1", secret).update(username).digest("base64");
  return { username, credential };
}

export function buildIceServers(env: Env, userId: string, nowMs = Date.now()): IceServer[] {
  const urls = list(env.TURN_URLS ?? env.NEXT_PUBLIC_TURN_URLS);
  if (urls.length === 0) return [STUN];

  if (env.TURN_SECRET) {
    return [STUN, { urls, ...mintTurnLogin(env.TURN_SECRET, userId, nowMs) }];
  }

  const username = env.TURN_USERNAME ?? env.NEXT_PUBLIC_TURN_USERNAME;
  const credential = env.TURN_CREDENTIAL ?? env.NEXT_PUBLIC_TURN_CREDENTIAL;
  // A relay with no login would be refused by it; better to say there is none.
  if (!username || !credential) return [STUN];
  return [STUN, { urls, username, credential }];
}
