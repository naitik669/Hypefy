import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { TURN_TTL_SECONDS, buildIceServers, mintTurnLogin } from "@/lib/ice";
import { callStartError, forgetRtcConfig, getRtcConfig } from "@/lib/call-setup";

/**
 * A call's relay login used to be compiled into the JavaScript everyone
 * downloads. It is handed out by the server now, to signed-in callers, and
 * is short-lived when the relay's secret is configured.
 */

const NOW = Date.UTC(2026, 9, 6, 12, 0, 0);
const URLS = "turn:relay.test:3478?transport=udp, turns:relay.test:5349?transport=tcp";

describe("the servers a call connects through", () => {
  it("is the public finder alone when no relay is set up", () => {
    const out = buildIceServers({}, "u1", NOW);
    expect(out).toHaveLength(1);
    expect(out[0].urls[0]).toMatch(/^stun:/);
    expect(out[0].username).toBeUndefined();
  });

  it("mints a login that expires, tied to the caller, when the relay's secret is set", () => {
    const out = buildIceServers({ TURN_URLS: URLS, TURN_SECRET: "s3cret" }, "u1", NOW);
    const relay = out[1];
    expect(relay.urls).toEqual(["turn:relay.test:3478?transport=udp", "turns:relay.test:5349?transport=tcp"]);
    const expiry = Math.floor(NOW / 1000) + TURN_TTL_SECONDS;
    expect(relay.username).toBe(`${expiry}:u1`);
    // What coturn will compute for itself from the same secret.
    expect(relay.credential).toBe(createHmac("sha1", "s3cret").update(`${expiry}:u1`).digest("base64"));
  });

  it("gives each caller, and each hour, a different login", () => {
    const a = mintTurnLogin("s3cret", "u1", NOW);
    expect(mintTurnLogin("s3cret", "u2", NOW).credential).not.toBe(a.credential);
    expect(mintTurnLogin("s3cret", "u1", NOW + 3_600_000).credential).not.toBe(a.credential);
    expect(mintTurnLogin("other", "u1", NOW).credential).not.toBe(a.credential);
  });

  it("prefers the secret over a fixed login when both are set", () => {
    const out = buildIceServers(
      { TURN_URLS: URLS, TURN_SECRET: "s3cret", TURN_USERNAME: "fixed", TURN_CREDENTIAL: "fixed-pw" },
      "u1",
      NOW,
    );
    expect(out[1].username).not.toBe("fixed");
  });

  it("still works from a fixed login, under the new names or the old", () => {
    expect(buildIceServers({ TURN_URLS: URLS, TURN_USERNAME: "n", TURN_CREDENTIAL: "p" }, "u1", NOW)[1]).toMatchObject({
      username: "n",
      credential: "p",
    });
    const old = buildIceServers(
      { NEXT_PUBLIC_TURN_URLS: URLS, NEXT_PUBLIC_TURN_USERNAME: "n", NEXT_PUBLIC_TURN_CREDENTIAL: "p" },
      "u1",
      NOW,
    );
    expect(old[1]).toMatchObject({ username: "n", credential: "p" });
  });

  it("offers no relay rather than one with no login", () => {
    expect(buildIceServers({ TURN_URLS: URLS }, "u1", NOW)).toHaveLength(1);
    expect(buildIceServers({ TURN_URLS: URLS, TURN_USERNAME: "n" }, "u1", NOW)).toHaveLength(1);
  });

  it("is no longer written into anything the browser downloads", () => {
    function sources(dir: string): string[] {
      return readdirSync(dir).flatMap((name) => {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) return sources(p);
        return p.endsWith(".tsx") || p.endsWith(".ts") ? [p] : [];
      });
    }
    // process.env.NEXT_PUBLIC_X is what the build inlines. Nothing may read
    // the relay's login that way.
    const leaks = sources("src").filter((p) => readFileSync(p, "utf8").includes("process.env.NEXT_PUBLIC_TURN"));
    expect(leaks).toEqual([]);
  });
});

describe("asking for them, from a call", () => {
  beforeEach(() => forgetRtcConfig());
  afterEach(() => vi.unstubAllGlobals());

  const answer = (body: unknown, ok = true) => vi.fn(async () => ({ ok, json: async () => body }) as Response);

  it("uses what the server gives, and asks once for calls close together", async () => {
    const fetched = answer({ iceServers: [{ urls: ["stun:a"] }, { urls: ["turn:b"], username: "n", credential: "p" }] });
    vi.stubGlobal("fetch", fetched);
    const first = await getRtcConfig(NOW);
    expect(first.iceServers).toHaveLength(2);
    await getRtcConfig(NOW + 60_000);
    expect(fetched).toHaveBeenCalledTimes(1);
    // A login lasts an hour: ask again well before then.
    await getRtcConfig(NOW + 31 * 60_000);
    expect(fetched).toHaveBeenCalledTimes(2);
  });

  it("lets the call go ahead without a relay when the answer cannot be had", async () => {
    vi.stubGlobal("fetch", answer({ error: "unauthorized" }, false));
    expect((await getRtcConfig(NOW)).iceServers).toHaveLength(1);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect((await getRtcConfig(NOW)).iceServers).toHaveLength(1);
    vi.stubGlobal("fetch", answer({ iceServers: [] }));
    expect((await getRtcConfig(NOW)).iceServers).toHaveLength(1);
  });
});

describe("why a call could not start", () => {
  const named = (name: string) => Object.assign(new Error("x"), { name });

  it("asks for permission only when permission is the problem", () => {
    expect(callStartError(named("NotAllowedError"), "call")).toBe("Allow the camera and microphone to call.");
    expect(callStartError(named("NotAllowedError"), "answer")).toBe("Allow the camera and microphone to answer.");
  });

  it("says so when there is no camera, or another app has it", () => {
    expect(callStartError(named("NotFoundError"), "call")).toMatch(/No camera or microphone/);
    expect(callStartError(named("NotReadableError"), "call")).toMatch(/in use by another app/);
  });

  it("does not blame permissions for anything else", () => {
    for (const err of [new Error("network"), null, "boom", named("TypeError")]) {
      expect(callStartError(err, "call")).toBe("Couldn't start the call. Try again.");
      expect(callStartError(err, "answer")).toBe("Couldn't answer the call. Try again.");
    }
  });
});
