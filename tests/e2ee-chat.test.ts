import { describe, it, expect } from "vitest";
import { canEncrypt, isEncrypted, openEnvelope, sealFor, type Reader } from "@/lib/e2ee/chat";
import { identityFromSeed, newSeed } from "@/lib/e2ee/crypto";

/**
 * The layer a chat screen actually calls.
 *
 * message.ts is already covered from both directions; what is new here is the
 * bookkeeping — which key goes with which person, and which of the three
 * outcomes a screen is handed. Getting the pair label backwards would make a
 * thread readable in one direction only, which is exactly the kind of bug
 * that looks like it works.
 */

const CONV = "conversation-1";
const ME = "me";
const PEER = "peer";

function pair() {
  const me = identityFromSeed(newSeed());
  const peer = identityFromSeed(newSeed());
  const mine: Reader = {
    me,
    peers: new Map([[PEER, { boxPub: peer.boxPub, signPub: peer.signPub }]]),
    loading: false,
  };
  const theirs: Reader = {
    me: peer,
    peers: new Map([[ME, { boxPub: me.boxPub, signPub: me.signPub }]]),
    loading: false,
  };
  return { mine, theirs };
}

describe("sealing", () => {
  it("produces something neither readable nor empty", () => {
    const { mine } = pair();
    const body = sealFor(mine, { plaintext: "on my way", conversationId: CONV, myId: ME, peerId: PEER });
    expect(body).not.toBeNull();
    expect(body).not.toContain("on my way");
    expect(isEncrypted(body)).toBe(true);
  });

  it("returns null when the other person has no keys yet", () => {
    // The ordinary state of messaging somebody who has not opened the app
    // since this shipped. Not an error — the caller sends plaintext and says so.
    const { mine } = pair();
    const stranger: Reader = { ...mine, peers: new Map() };
    expect(sealFor(stranger, { plaintext: "hi", conversationId: CONV, myId: ME, peerId: PEER })).toBeNull();
    expect(canEncrypt(stranger, PEER)).toBe(false);
  });

  it("returns null when this device is locked", () => {
    const { mine } = pair();
    const locked: Reader = { ...mine, me: null };
    expect(sealFor(locked, { plaintext: "hi", conversationId: CONV, myId: ME, peerId: PEER })).toBeNull();
    expect(canEncrypt(locked, PEER)).toBe(false);
  });
});

describe("reading", () => {
  it("opens for the person it was sent to", () => {
    const { mine, theirs } = pair();
    const body = sealFor(mine, { plaintext: "on my way", conversationId: CONV, myId: ME, peerId: PEER });
    expect(openEnvelope(theirs, { body, senderId: ME, myId: PEER, peerId: ME })).toEqual({
      state: "open",
      text: "on my way",
    });
  });

  it("opens for the sender too — their own history on a new phone", () => {
    const { mine } = pair();
    const body = sealFor(mine, { plaintext: "on my way", conversationId: CONV, myId: ME, peerId: PEER });
    expect(openEnvelope(mine, { body, senderId: ME, myId: ME, peerId: PEER })).toEqual({
      state: "open",
      text: "on my way",
    });
  });

  it("works in both directions of the same thread", () => {
    // The pair label is sender|recipient, so a reply flips it. Getting this
    // wrong makes one direction silently unreadable.
    const { mine, theirs } = pair();
    const reply = sealFor(theirs, { plaintext: "see you there", conversationId: CONV, myId: PEER, peerId: ME });
    expect(openEnvelope(mine, { body: reply, senderId: PEER, myId: ME, peerId: PEER })).toEqual({
      state: "open",
      text: "see you there",
    });
    expect(openEnvelope(theirs, { body: reply, senderId: PEER, myId: PEER, peerId: ME })).toEqual({
      state: "open",
      text: "see you there",
    });
  });

  it("calls ordinary text plain, not locked", () => {
    // Every message sent before encryption existed comes through here, and
    // showing a lock over readable history would be a lie.
    const { mine } = pair();
    for (const body of ["hello", "", null, "{not json"]) {
      expect(openEnvelope(mine, { body, senderId: PEER, myId: ME, peerId: PEER }).state).toBe("plain");
    }
  });

  it("reports locked rather than throwing when the device has no key", () => {
    const { mine } = pair();
    const body = sealFor(mine, { plaintext: "hi", conversationId: CONV, myId: ME, peerId: PEER });
    const locked: Reader = { ...mine, me: null };
    expect(openEnvelope(locked, { body, senderId: ME, myId: ME, peerId: PEER }).state).toBe("locked");
  });

  it("reports locked when the sender's key is not the one that sealed it", () => {
    const { mine, theirs } = pair();
    const body = sealFor(mine, { plaintext: "hi", conversationId: CONV, myId: ME, peerId: PEER });
    const impostor = identityFromSeed(newSeed());
    const wrong: Reader = {
      ...theirs,
      peers: new Map([[ME, { boxPub: impostor.boxPub, signPub: impostor.signPub }]]),
    };
    expect(openEnvelope(wrong, { body, senderId: ME, myId: PEER, peerId: ME }).state).toBe("locked");
  });

  it("does not open for a third person who happens to hold the row", () => {
    const { mine } = pair();
    const body = sealFor(mine, { plaintext: "hi", conversationId: CONV, myId: ME, peerId: PEER });
    const eve = identityFromSeed(newSeed());
    const hers: Reader = { me: eve, peers: mine.peers, loading: false };
    expect(openEnvelope(hers, { body, senderId: ME, myId: "eve", peerId: PEER }).state).toBe("locked");
  });
});

describe("isEncrypted", () => {
  it("tells an envelope from anything else without needing a key", () => {
    const { mine } = pair();
    expect(isEncrypted(sealFor(mine, { plaintext: "x", conversationId: CONV, myId: ME, peerId: PEER }))).toBe(true);
    // Voice notes and documents pack their own JSON into the body.
    expect(isEncrypted('{"url":"https://x","duration":7}')).toBe(false);
    expect(isEncrypted("plain words")).toBe(false);
    expect(isEncrypted(null)).toBe(false);
  });
});
