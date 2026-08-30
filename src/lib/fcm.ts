import "server-only";
import { createSign } from "node:crypto";

/**
 * Minimal FCM HTTP v1 sender.
 *
 * Signs a service-account JWT with node:crypto rather than pulling in
 * firebase-admin, which is a large dependency for the one thing needed here:
 * post a notification to a device token. The legacy server-key API is not used
 * because it is deprecated and Google has been switching it off.
 *
 * Requires FCM_SERVICE_ACCOUNT — the service account JSON from the Firebase
 * console, as a single-line string.
 */

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

function serviceAccount(): ServiceAccount | null {
  const raw = process.env.FCM_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ServiceAccount;
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) return null;
    // Env vars flatten newlines; the PEM is invalid without them restored.
    parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
    return parsed;
  } catch {
    return null;
  }
}

export function fcmConfigured(): boolean {
  return serviceAccount() !== null;
}

const b64url = (input: string | Buffer) =>
  Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Access tokens last an hour; a fresh one per notification would add a full
 *  round trip to Google on every push. */
let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(sa: ServiceAccount): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claim}`);
  const signature = b64url(signer.sign(sa.private_key));
  const assertion = `${header}.${claim}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`fcm oauth ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

export type FcmSendResult = "sent" | "stale" | "failed";

/**
 * Send one notification to one device token.
 *
 * Reports `stale` separately from `failed` so the caller can prune tokens for
 * uninstalled apps — FCM answers UNREGISTERED/NOT_FOUND for those, and
 * without pruning they accumulate forever and every push retries them.
 */
export async function sendFcm(
  token: string,
  notification: { title: string; body: string; url?: string; tag?: string },
): Promise<FcmSendResult> {
  const sa = serviceAccount();
  if (!sa) return "failed";

  try {
    const access = await accessToken(sa);
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: notification.title, body: notification.body },
            // Carried as data too: the notification block is what the OS shows
            // while the app is backgrounded, but the tap handler reads data to
            // know where to navigate.
            data: {
              ...(notification.url ? { url: notification.url } : {}),
              ...(notification.tag ? { tag: notification.tag } : {}),
            },
            android: {
              priority: "HIGH",
              notification: {
                // Matches the app's accent so the status bar icon is tinted.
                color: "#a3e635",
                ...(notification.tag ? { tag: notification.tag } : {}),
              },
            },
          },
        }),
        cache: "no-store",
      },
    );

    if (res.ok) return "sent";

    const body = await res.text();
    if (res.status === 404 || body.includes("UNREGISTERED") || body.includes("NOT_FOUND")) {
      return "stale";
    }
    console.error(`[fcm] ${res.status}: ${body.slice(0, 240)}`);
    return "failed";
  } catch (err) {
    console.error("[fcm] send failed", err);
    return "failed";
  }
}
