import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * E2EE is parked, and parked has to mean parked.
 *
 * Hypefy launches on standard client-server encryption. The E2EE code stays
 * in the tree behind one flag, off by default. If any path still sealed a
 * message with the flag off, people would be encrypting to a vault nobody
 * set up and nobody can recover — the exact failure the pivot exists to
 * avoid. So each of these asserts the OFF behaviour directly, by loading the
 * modules fresh with the flag off.
 *
 * (The rest of the E2EE tests run with the flag on — see vitest.config.ts —
 * because the modules still have to be correct for the day it comes back.)
 */

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function withFlag(value: string | undefined) {
  vi.resetModules();
  if (value === undefined) vi.stubEnv("NEXT_PUBLIC_E2EE", "");
  else vi.stubEnv("NEXT_PUBLIC_E2EE", value);
  const flag = await import("@/lib/e2ee/flag");
  const chat = await import("@/lib/e2ee/chat");
  const crypto = await import("@/lib/e2ee/crypto");
  return { flag, chat, crypto };
}

/** A reader that would encrypt if the flag let it: everything ready. */
function readyReader(c: typeof import("@/lib/e2ee/crypto")) {
  const me = c.identityFromSeed(c.newSeed());
  const peer = c.identityFromSeed(c.newSeed());
  return {
    me,
    peers: new Map([["peer", { boxPub: peer.boxPub, signPub: peer.signPub }]]),
    self: "ready" as const,
    loading: false,
  };
}

const args = { plaintext: "hi", conversationId: "c", myId: "me", peerId: "peer" };

describe("with the flag off (the default)", () => {
  it("is off unless it is exactly \"on\"", async () => {
    for (const v of [undefined, "", "off", "true", "1", "ON "]) {
      expect((await withFlag(v)).flag.E2EE_ENABLED).toBe(false);
    }
  });

  it("never seals a message, even with every key present and everyone ready", async () => {
    const { chat, crypto } = await withFlag("off");
    expect(chat.sealFor(readyReader(crypto), args)).toBeNull();
  });

  it("never claims a thread can be encrypted", async () => {
    const { chat, crypto } = await withFlag("off");
    expect(chat.canEncrypt(readyReader(crypto), "peer")).toBe(false);
  });

  it("still reads an envelope if one somehow exists — parking must not hide history", async () => {
    // Zero exist today, but a flag that made stored messages unreadable
    // would turn a switch into a data-loss event.
    const on = await withFlag("on");
    const r = readyReader(on.crypto);
    const body = on.chat.sealFor(r, args)!;
    expect(body).toBeTruthy();

    const off = await withFlag("off");
    const asPeer = {
      me: r.me,
      peers: new Map([["peer", r.peers.get("peer")!]]),
    };
    // The sender's own copy opens with the flag off.
    expect(off.chat.openEnvelope(asPeer, { body, senderId: "me", myId: "me", peerId: "peer" }).state).toBe("open");
  });
});

describe("with the flag on", () => {
  it("seals when the account is ready and the peer has keys", async () => {
    const { chat, crypto } = await withFlag("on");
    expect(chat.sealFor(readyReader(crypto), args)).not.toBeNull();
  });
});
