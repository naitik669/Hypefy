import { describe, it, expect } from "vitest";
import { encryptText, decryptText, parseEnvelope, verifyAuthorship, ENVELOPE_V } from "@/lib/e2ee/message";
import { identityFromSeed, newSeed, toB64 } from "@/lib/e2ee/crypto";

/**
 * The message envelope — what actually sits in messages.body.
 *
 * The properties that matter: both people can read it and nobody else can,
 * the sender can still read their own history on a new phone, and a report
 * can be believed. Each of those has a way of failing silently, so each is
 * asserted from both directions.
 */

const CONV = "conversation-1";
const ALICE = "alice";
const BOB = "bob";

function pair() {
  const alice = identityFromSeed(newSeed());
  const bob = identityFromSeed(newSeed());
  return { alice, bob };
}

function fromAlice(plaintext: string, conversationId = CONV) {
  const { alice, bob } = pair();
  const body = encryptText({
    plaintext,
    conversationId,
    sender: alice,
    senderId: ALICE,
    recipientId: BOB,
    recipientBoxPub: bob.boxPub,
  });
  return { alice, bob, body, envelope: parseEnvelope(body)! };
}

describe("what lands in the database", () => {
  it("contains none of the plaintext", async () => {
    const { body } = fromAlice("meet me at the roof at eight");
    expect(body).not.toContain("roof");
    expect(body).not.toContain("meet");
    expect(body).not.toContain("eight");
  });

  it("is a parseable envelope with a copy for each person", () => {
    const { envelope } = fromAlice("hi");
    expect(envelope.v).toBe(ENVELOPE_V);
    expect(Object.keys(envelope.boxes).sort()).toEqual([ALICE, BOB]);
  });

  it("is never empty, so send_message's non-empty check still passes", () => {
    const { body } = fromAlice("");
    expect(body.length).toBeGreaterThan(0);
  });

  it("looks different every time, even for the same words", () => {
    const one = fromAlice("ok").body;
    const two = fromAlice("ok").body;
    expect(one).not.toBe(two);
  });
});

describe("parseEnvelope", () => {
  it("recognises an envelope", () => {
    expect(parseEnvelope(fromAlice("hi").body)).not.toBeNull();
  });

  it("leaves ordinary text alone", () => {
    // Every message sent before encryption existed comes through here.
    for (const plain of ["hello", "", "{not json", "1", "  {}", "🌊 hi"]) {
      expect(parseEnvelope(plain)).toBeNull();
    }
    expect(parseEnvelope(null)).toBeNull();
  });

  it("rejects JSON that is not one of ours", () => {
    // Another kind's body — voice notes and documents pack JSON too.
    expect(parseEnvelope('{"url":"https://x","duration":7}')).toBeNull();
    expect(parseEnvelope('{"v":1}')).toBeNull();
  });
});

describe("reading it", () => {
  it("opens for the person it was sent to", () => {
    const { alice, bob, envelope } = fromAlice("meet me at eight");
    const out = decryptText({
      envelope,
      me: bob,
      myId: BOB,
      senderId: ALICE,
      senderBoxPub: alice.boxPub,
      recipientId: BOB,
    });
    expect(out).toBe("meet me at eight");
  });

  it("opens for the sender too — their own history on a new phone", () => {
    // Without the second copy they would have sent something only the other
    // person could ever read.
    const { alice, envelope } = fromAlice("meet me at eight");
    const out = decryptText({
      envelope,
      me: alice,
      myId: ALICE,
      senderId: ALICE,
      senderBoxPub: alice.boxPub,
      recipientId: BOB,
    });
    expect(out).toBe("meet me at eight");
  });

  it("does not open for anyone else", () => {
    const { alice, envelope } = fromAlice("meet me at eight");
    const eve = identityFromSeed(newSeed());
    // Even naming themselves as the recipient.
    expect(
      decryptText({
        envelope,
        me: eve,
        myId: BOB,
        senderId: ALICE,
        senderBoxPub: alice.boxPub,
        recipientId: BOB,
      }),
    ).toBeNull();
  });

  it("returns null rather than throwing when there is no copy for us", () => {
    const { alice, envelope } = fromAlice("hi");
    const carol = identityFromSeed(newSeed());
    expect(
      decryptText({
        envelope,
        me: carol,
        myId: "carol",
        senderId: ALICE,
        senderBoxPub: alice.boxPub,
        recipientId: BOB,
      }),
    ).toBeNull();
  });

  it("refuses an envelope version it does not understand", () => {
    const { alice, bob, envelope } = fromAlice("hi");
    const future = { ...envelope, v: 99 };
    expect(
      decryptText({
        envelope: future,
        me: bob,
        myId: BOB,
        senderId: ALICE,
        senderBoxPub: alice.boxPub,
        recipientId: BOB,
      }),
    ).toBeNull();
  });

  it("refuses when the sender's key is not the one that sealed it", () => {
    // A rotated identity, or someone impersonating the sender.
    const { bob, envelope } = fromAlice("hi");
    const impostor = identityFromSeed(newSeed());
    expect(
      decryptText({
        envelope,
        me: bob,
        myId: BOB,
        senderId: ALICE,
        senderBoxPub: impostor.boxPub,
        recipientId: BOB,
      }),
    ).toBeNull();
  });

  it("carries unicode, emoji and newlines through unharmed", () => {
    const msg = "नमस्ते 🌊\nline two\ttab café";
    const { alice, bob, envelope } = fromAlice(msg);
    expect(
      decryptText({
        envelope,
        me: bob,
        myId: BOB,
        senderId: ALICE,
        senderBoxPub: alice.boxPub,
        recipientId: BOB,
      }),
    ).toBe(msg);
  });

  it("survives a long message", () => {
    const msg = "x".repeat(5000);
    const { alice, bob, envelope } = fromAlice(msg);
    expect(
      decryptText({
        envelope,
        me: bob,
        myId: BOB,
        senderId: ALICE,
        senderBoxPub: alice.boxPub,
        recipientId: BOB,
      }),
    ).toBe(msg);
  });
});

describe("proving who sent it", () => {
  it("verifies the real sender", () => {
    const { alice, envelope } = fromAlice("I'll be there");
    expect(
      verifyAuthorship({
        plaintext: "I'll be there",
        envelope,
        conversationId: CONV,
        senderId: ALICE,
        recipientId: BOB,
        senderSignPub: alice.signPub,
      }),
    ).toBe(true);
  });

  it("rejects a reporter who changed the words", () => {
    // The whole reason the signature exists: without it, a report could
    // attribute anything to anyone.
    const { alice, envelope } = fromAlice("see you tomorrow");
    expect(
      verifyAuthorship({
        plaintext: "I am going to hurt you",
        envelope,
        conversationId: CONV,
        senderId: ALICE,
        recipientId: BOB,
        senderSignPub: alice.signPub,
      }),
    ).toBe(false);
  });

  it("rejects a signature checked against the wrong person", () => {
    const { envelope } = fromAlice("hi");
    const someoneElse = identityFromSeed(newSeed());
    expect(
      verifyAuthorship({
        plaintext: "hi",
        envelope,
        conversationId: CONV,
        senderId: ALICE,
        recipientId: BOB,
        senderSignPub: someoneElse.signPub,
      }),
    ).toBe(false);
  });

  it("rejects a signature lifted from another conversation", () => {
    const { alice, envelope } = fromAlice("hi", "conversation-1");
    expect(
      verifyAuthorship({
        plaintext: "hi",
        envelope,
        conversationId: "conversation-2",
        senderId: ALICE,
        recipientId: BOB,
        senderSignPub: alice.signPub,
      }),
    ).toBe(false);
  });

  it("rejects a mangled signature rather than throwing", () => {
    const { alice, envelope } = fromAlice("hi");
    expect(
      verifyAuthorship({
        plaintext: "hi",
        envelope: { ...envelope, sig: "not base64 !!" },
        conversationId: CONV,
        senderId: ALICE,
        recipientId: BOB,
        senderSignPub: alice.signPub,
      }),
    ).toBe(false);
  });
});

describe("tampering", () => {
  it("is caught when a ciphertext is altered", () => {
    const { alice, bob, envelope } = fromAlice("send 10");
    const bytes = [...envelope.boxes[BOB].c];
    bytes[0] = bytes[0] === "A" ? "B" : "A";
    const tampered = {
      ...envelope,
      boxes: { ...envelope.boxes, [BOB]: { ...envelope.boxes[BOB], c: bytes.join("") } },
    };
    expect(
      decryptText({
        envelope: tampered,
        me: bob,
        myId: BOB,
        senderId: ALICE,
        senderBoxPub: alice.boxPub,
        recipientId: BOB,
      }),
    ).toBeNull();
  });

  it("means one person's copy cannot be swapped for the other's", () => {
    // Both are sealed under the same pair label but to different keys.
    const { alice, bob, envelope } = fromAlice("hi");
    const swapped = {
      ...envelope,
      boxes: { ...envelope.boxes, [BOB]: envelope.boxes[ALICE] },
    };
    expect(
      decryptText({
        envelope: swapped,
        me: bob,
        myId: BOB,
        senderId: ALICE,
        senderBoxPub: alice.boxPub,
        recipientId: BOB,
      }),
    ).toBeNull();
  });
});

describe("the public keys travel with nothing secret", () => {
  it("never puts a private key in the envelope", () => {
    const { alice, bob, body } = fromAlice("hi");
    for (const secret of [alice.boxPriv, alice.signPriv, bob.boxPriv, bob.signPriv]) {
      expect(body).not.toContain(toB64(secret));
    }
  });
});
