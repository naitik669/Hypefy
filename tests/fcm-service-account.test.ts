// @vitest-environment node
//
// Node, not the suite's jsdom: fcm.ts imports "server-only", which throws
// "cannot be imported from a Client Component" in a browser-like
// environment. That guard is correct — this module signs JWTs with a private
// key and must never reach a bundle — so the test moves rather than the
// module.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { generateKeyPairSync, createSign } from "node:crypto";
import { readFileSync } from "node:fs";

/**
 * `server-only` throws on import unless the "react-server" export
 * condition is active. Next sets that condition for server components;
 * Vitest does not, so the guard fires here even under the node
 * environment and fcm.ts cannot be imported at all.
 *
 * Mocked in THIS FILE rather than aliased in vitest.config.ts, which
 * would switch the guard off for the whole suite — and that guard is
 * what stops a module holding a private key from reaching a client
 * bundle. `npm run build` is what enforces it for real; nothing here
 * should make the suite blind to it.
 */
vi.mock("server-only", () => ({}));

/**
 * The shape FCM_SERVICE_ACCOUNT has to be in.
 *
 * Written because the question "what exactly goes in this variable" has a
 * fiddly answer and getting it wrong fails in the worst way: fcmConfigured()
 * returns false, sendFcm declines quietly, and no notification is ever sent
 * with nothing in the logs to say why.
 *
 * The awkward part is `private_key`. Firebase hands it over as JSON with the
 * PEM's line breaks escaped as `\n`, and a PEM without real line breaks is
 * not a valid key. Three things can happen to it on the way into an env var,
 * and the two that are survivable are asserted here.
 *
 * Every key below is generated in the test. Nothing real goes near this file.
 */

/** A service account JSON in exactly the shape Firebase downloads. */
function serviceAccountJson(privateKeyPem: string): string {
  return JSON.stringify({
    type: "service_account",
    project_id: "hypefy-4f6bb",
    private_key_id: "0".repeat(40),
    private_key: privateKeyPem,
    client_email: "firebase-adminsdk-fbsvc@hypefy-4f6bb.iam.gserviceaccount.com",
    client_id: "109318980444142396982",
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    client_x509_cert_url:
      "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40hypefy-4f6bb.iam.gserviceaccount.com",
    universe_domain: "googleapis.com",
  });
}

/** A throwaway RSA key, same algorithm and size as a real one. */
function throwawayKey(): string {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  return privateKey as string;
}

const original = process.env.FCM_SERVICE_ACCOUNT;

beforeEach(() => {
  delete process.env.FCM_SERVICE_ACCOUNT;
  // accessToken() caches the exchanged token in module scope. Without a reset,
  // a later test reuses the token minted from an earlier test's key and never
  // exercises signing at all — which is the one thing worth exercising.
  vi.resetModules();
});

afterEach(() => {
  if (original === undefined) delete process.env.FCM_SERVICE_ACCOUNT;
  else process.env.FCM_SERVICE_ACCOUNT = original;
  vi.unstubAllGlobals();
});

/**
 * Stands in for Google. Answers the OAuth exchange with a token and the send
 * with 200, and records what was asked for.
 */
function stubFetch() {
  const calls: string[] = [];
  const mock = vi.fn(async (input: unknown) => {
    const href = String(input);
    calls.push(href);
    if (href.includes("oauth2.googleapis.com")) {
      return new Response(JSON.stringify({ access_token: "test-token", expires_in: 3600 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("{}", { status: 200 });
  });
  vi.stubGlobal("fetch", mock);
  return calls;
}

/** Re-imported per test: serviceAccount() reads the env at call time, but a
 *  cached module would carry a stale token between tests. */
async function fcm() {
  const mod = await import("@/lib/fcm");
  return mod;
}

describe("FCM_SERVICE_ACCOUNT", () => {
  it("is not configured when the variable is absent", () => {
    // The quiet default. sendFcm declines rather than throwing, which is
    // right — but it means an unset variable looks exactly like a working
    // app that nobody has notified.
    return fcm().then((m) => expect(m.fcmConfigured()).toBe(false));
  });

  it("accepts the file exactly as Firebase downloads it", async () => {
    // One line, every field, `\n` escaped inside the private_key string.
    // This is the answer to "what do I paste".
    process.env.FCM_SERVICE_ACCOUNT = serviceAccountJson(throwawayKey());
    const m = await fcm();
    expect(m.fcmConfigured()).toBe(true);
  });

  it("and the key it ends up with can actually sign", async () => {
    /*
     * The assertion that matters. fcmConfigured() only checks three fields
     * are present — a private_key whose line breaks were lost is present,
     * truthy, and useless. The real test is whether node's crypto will sign
     * with it, because that is what the JWT exchange does.
     */
    const pem = throwawayKey();
    process.env.FCM_SERVICE_ACCOUNT = serviceAccountJson(pem);
    const m = await fcm();
    expect(m.fcmConfigured()).toBe(true);

    const parsed = JSON.parse(process.env.FCM_SERVICE_ACCOUNT) as { private_key: string };
    const signer = createSign("RSA-SHA256");
    signer.update("header.claim");
    expect(() => signer.sign(parsed.private_key)).not.toThrow();
  });

  it("survives a platform that doubles the backslashes", async () => {
    /*
     * The case fcm.ts's `replace(/\\n/g, "\n")` exists for. Some hosts
     * escape the value again on the way in, so what JSON.parse hands back
     * contains literal backslash-n rather than newlines. Without the
     * replace that PEM is invalid; with it, it is restored.
     */
    const pem = throwawayKey();
    const doubled = serviceAccountJson(pem).replace(/\\n/g, "\\\\n");
    process.env.FCM_SERVICE_ACCOUNT = doubled;
    const m = await fcm();
    expect(m.fcmConfigured()).toBe(true);

    // And prove the recovery is real: the doubled form is broken before the
    // replace and signs after it.
    const parsed = JSON.parse(doubled) as { private_key: string };
    expect(parsed.private_key).toContain("\\n");
    expect(() => createSign("RSA-SHA256").update("x").sign(parsed.private_key)).toThrow();
    const restored = parsed.private_key.replace(/\\n/g, "\n");
    expect(() => createSign("RSA-SHA256").update("x").sign(restored)).not.toThrow();
  });

  it("and fcm.ts hands the signer the restored key, not the doubled one", async () => {
    /*
     * The assertion the test above does NOT make, found by mutation: deleting
     * the `replace` from fcm.ts entirely leaves that test green, because
     * fcmConfigured() only counts fields and the crypto there runs on a local
     * copy rather than on anything fcm.ts produced.
     *
     * Signing is the only thing that can tell a restored PEM from a broken
     * one, and accessToken() signs on the way to every send. So drive the real
     * path with Google stubbed: with the restore, the JWT signs and the token
     * exchange is attempted; without it, sign() throws, sendFcm's catch
     * reports "failed", and fetch is never called.
     */
    const doubled = serviceAccountJson(throwawayKey()).replace(/\\n/g, "\\\\n");
    process.env.FCM_SERVICE_ACCOUNT = doubled;
    const calls = stubFetch();

    const m = await fcm();
    expect(await m.sendFcm("device-token", { title: "t", body: "b" })).toBe("sent");

    expect(calls.some((c) => c.includes("oauth2.googleapis.com/token"))).toBe(true);
  });

  it("posts to the project named by the service account", async () => {
    /*
     * The same guarantee the source-text test below asserts, but through
     * behaviour. A project switch is two-sided — the client registers tokens
     * in whatever google-services.json names, the server posts to this one —
     * and a mismatch is rejected silently by FCM.
     */
    process.env.FCM_SERVICE_ACCOUNT = serviceAccountJson(throwawayKey());
    const calls = stubFetch();

    const m = await fcm();
    expect(await m.sendFcm("device-token", { title: "t", body: "b" })).toBe("sent");

    const send = calls.find((c) => c.includes("messages:send"));
    expect(send).toBe("https://fcm.googleapis.com/v1/projects/hypefy-4f6bb/messages:send");
  });

  it("but NOT a PEM pasted with real line breaks", async () => {
    /*
     * The one that cannot be recovered, and the mistake worth warning about:
     * pasting the private key across several lines. A raw newline inside a
     * JSON string is invalid JSON, so JSON.parse throws, serviceAccount()
     * returns null from its catch, and the app reports "not configured"
     * while the variable sits there looking filled in.
     */
    const broken = serviceAccountJson(throwawayKey()).replace(/\\n/g, "\n");
    process.env.FCM_SERVICE_ACCOUNT = broken;
    const m = await fcm();
    expect(m.fcmConfigured()).toBe(false);
  });

  it("nor a JSON object missing any of the three fields it needs", async () => {
    for (const drop of ["project_id", "client_email", "private_key"]) {
      const obj = JSON.parse(serviceAccountJson(throwawayKey())) as Record<string, unknown>;
      delete obj[drop];
      process.env.FCM_SERVICE_ACCOUNT = JSON.stringify(obj);
      const m = await fcm();
      expect(m.fcmConfigured(), `missing ${drop} should not configure`).toBe(false);
    }
  });

  it("nor anything that is not JSON at all", async () => {
    // A bare private key, or the file path instead of the contents.
    for (const junk of ["-----BEGIN PRIVATE KEY-----", "./service-account.json", "{"]) {
      process.env.FCM_SERVICE_ACCOUNT = junk;
      const m = await fcm();
      expect(m.fcmConfigured(), `${junk} should not configure`).toBe(false);
    }
  });
});

describe("the project the server sends from", () => {
  it("comes from the service account, not from google-services.json", async () => {
    /*
     * The thing that makes a project switch a two-sided change. The client
     * registers tokens in whatever project google-services.json names; the
     * server posts to projects/<project_id>/messages:send with the project
     * from THIS variable. If they disagree, every send is rejected and
     * nothing says so.
     */
    const src = readFcmSource();
    expect(src).toContain("https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send");
    expect(src).toContain("process.env.FCM_SERVICE_ACCOUNT");
    // And google-services.json is nowhere near the server path.
    expect(src).not.toContain("google-services");
  });
});

function readFcmSource(): string {
  return readFileSync("src/lib/fcm.ts", "utf8");
}
