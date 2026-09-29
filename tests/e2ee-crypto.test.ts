import { describe, it, expect } from "vitest";
import {
  randomBytes,
  toB64,
  fromB64,
  deriveKek,
  wrap,
  unwrap,
  identityFromSeed,
  newSeed,
  sealTo,
  openFrom,
  sign,
  verify,
  KEY_BYTES,
  SALT_BYTES,
} from "@/lib/e2ee/crypto";

/**
 * These are the tests that matter most in the codebase.
 *
 * Everything else fails loudly — a broken layout is visible, a broken query
 * throws. Broken cryptography looks exactly like working cryptography until
 * someone reads a message they should not have been able to read. So each of
 * these asserts a property, not a happy path: that the wrong key fails, that
 * a changed byte is caught, that one person's key cannot open another
 * person's message.
 */

const text = (s: string) => new TextEncoder().encode(s);
const str = (b: Uint8Array) => new TextDecoder().decode(b);

const ALICE = "alice-user-id";
const BOB = "bob-user-id";

describe("base64", () => {
  it("round-trips arbitrary bytes", () => {
    for (const n of [0, 1, 16, 32, 255]) {
      const b = randomBytes(n);
      expect(fromB64(toB64(b))).toEqual(b);
    }
  });

  it("survives every byte value, not just printable ones", () => {
    const all = new Uint8Array(256).map((_, i) => i);
    expect(fromB64(toB64(all))).toEqual(all);
  });
});

describe("deriveKek", () => {
  it("gives a 32-byte key", () => {
    expect(deriveKek("hunter2", new Uint8Array(SALT_BYTES))).toHaveLength(KEY_BYTES);
  });

  it("is deterministic for the same password and salt", () => {
    const salt = randomBytes(SALT_BYTES);
    expect(deriveKek("hunter2", salt)).toEqual(deriveKek("hunter2", salt));
  });

  it("differs for a different password", () => {
    const salt = randomBytes(SALT_BYTES);
    expect(deriveKek("hunter2", salt)).not.toEqual(deriveKek("hunter3", salt));
  });

  it("differs for a different salt — so two users with one password differ", () => {
    expect(deriveKek("hunter2", randomBytes(SALT_BYTES))).not.toEqual(
      deriveKek("hunter2", randomBytes(SALT_BYTES)),
    );
  });

  it("normalises unicode, so the same typed password always works", () => {
    // é as one code point vs e + combining accent. A phone keyboard and a
    // desktop one can produce different bytes for the same visible password.
    expect(deriveKek("café", new Uint8Array(SALT_BYTES))).toEqual(
      deriveKek("café", new Uint8Array(SALT_BYTES)),
    );
  });
});

describe("wrap / unwrap", () => {
  it("round-trips a key", () => {
    const kek = randomBytes(KEY_BYTES);
    const key = randomBytes(KEY_BYTES);
    expect(unwrap(wrap(key, kek), kek)).toEqual(key);
  });

  it("returns null for the wrong key rather than throwing", () => {
    // A wrong password is an ordinary event, not an exception.
    const key = randomBytes(KEY_BYTES);
    expect(unwrap(wrap(key, randomBytes(KEY_BYTES)), randomBytes(KEY_BYTES))).toBeNull();
  });

  it("detects a single flipped bit anywhere in the blob", () => {
    const kek = randomBytes(KEY_BYTES);
    const blob = wrap(randomBytes(KEY_BYTES), kek);
    for (const i of [0, 5, 23, 24, blob.length - 1]) {
      const tampered = new Uint8Array(blob);
      tampered[i] ^= 1;
      expect(unwrap(tampered, kek)).toBeNull();
    }
  });

  it("produces a different blob every time, even for the same key", () => {
    // A fresh random nonce each call; identical output would leak that two
    // users share a password.
    const kek = randomBytes(KEY_BYTES);
    const key = randomBytes(KEY_BYTES);
    expect(wrap(key, kek)).not.toEqual(wrap(key, kek));
  });

  it("refuses a blob too short to contain a nonce", () => {
    expect(unwrap(new Uint8Array(4), randomBytes(KEY_BYTES))).toBeNull();
    expect(unwrap(new Uint8Array(0), randomBytes(KEY_BYTES))).toBeNull();
  });
});

describe("identityFromSeed", () => {
  it("is deterministic — the same seed always gives the same identity", () => {
    // This is what makes a recovery code work: the seed is the only thing
    // that has to survive.
    const seed = newSeed();
    expect(identityFromSeed(seed)).toEqual(identityFromSeed(seed));
  });

  it("gives different seeds different identities", () => {
    expect(identityFromSeed(newSeed()).boxPub).not.toEqual(identityFromSeed(newSeed()).boxPub);
  });

  it("keeps the signing key and the encryption key independent", () => {
    // Reusing one secret across two algorithms is a known way to lose both.
    const seed = newSeed();
    const id = identityFromSeed(seed);
    expect(id.boxPriv).not.toEqual(id.signPriv);
    // And neither is the seed itself, so leaking one key does not leak the rest.
    expect(id.boxPriv).not.toEqual(seed);
    expect(id.signPriv).not.toEqual(seed);
  });

  it("produces keys of the right size", () => {
    const id = identityFromSeed(newSeed());
    for (const k of [id.boxPub, id.boxPriv, id.signPub, id.signPriv]) {
      expect(k).toHaveLength(32);
    }
  });
});

describe("sealTo / openFrom", () => {
  it("lets the intended recipient read it", () => {
    const a = identityFromSeed(newSeed());
    const b = identityFromSeed(newSeed());
    const box = sealTo(text("meet at 8"), b.boxPub, a.boxPriv, ALICE, BOB);
    expect(str(openFrom(box, a.boxPub, b.boxPriv, ALICE, BOB)!)).toBe("meet at 8");
  });

  it("does not let a third party read it", () => {
    const a = identityFromSeed(newSeed());
    const b = identityFromSeed(newSeed());
    const eve = identityFromSeed(newSeed());
    const box = sealTo(text("meet at 8"), b.boxPub, a.boxPriv, ALICE, BOB);
    expect(openFrom(box, a.boxPub, eve.boxPriv, ALICE, BOB)).toBeNull();
  });

  it("fails if the claimed sender is not the real one", () => {
    const a = identityFromSeed(newSeed());
    const b = identityFromSeed(newSeed());
    const mallory = identityFromSeed(newSeed());
    const box = sealTo(text("meet at 8"), b.boxPub, a.boxPriv, ALICE, BOB);
    expect(openFrom(box, mallory.boxPub, b.boxPriv, ALICE, BOB)).toBeNull();
  });

  it("is bound to the pair it was written for", () => {
    // A ciphertext lifted out of one conversation must not open in another.
    const a = identityFromSeed(newSeed());
    const b = identityFromSeed(newSeed());
    const box = sealTo(text("meet at 8"), b.boxPub, a.boxPriv, ALICE, BOB);
    expect(openFrom(box, a.boxPub, b.boxPriv, "someone-else", BOB)).toBeNull();
    expect(openFrom(box, a.boxPub, b.boxPriv, ALICE, "someone-else")).toBeNull();
  });

  it("detects tampering with the ciphertext", () => {
    const a = identityFromSeed(newSeed());
    const b = identityFromSeed(newSeed());
    const box = sealTo(text("send 10"), b.boxPub, a.boxPriv, ALICE, BOB);
    const bytes = fromB64(box.c);
    bytes[0] ^= 1;
    expect(openFrom({ n: box.n, c: toB64(bytes) }, a.boxPub, b.boxPriv, ALICE, BOB)).toBeNull();
  });

  it("encrypts the same words differently each time", () => {
    const a = identityFromSeed(newSeed());
    const b = identityFromSeed(newSeed());
    const one = sealTo(text("ok"), b.boxPub, a.boxPriv, ALICE, BOB);
    const two = sealTo(text("ok"), b.boxPub, a.boxPriv, ALICE, BOB);
    expect(one.c).not.toBe(two.c);
  });

  it("carries unicode and emoji through unharmed", () => {
    const a = identityFromSeed(newSeed());
    const b = identityFromSeed(newSeed());
    const msg = "नमस्ते 🌊 café \u0000 end";
    const box = sealTo(text(msg), b.boxPub, a.boxPriv, ALICE, BOB);
    expect(str(openFrom(box, a.boxPub, b.boxPriv, ALICE, BOB)!)).toBe(msg);
  });

  it("handles an empty message", () => {
    const a = identityFromSeed(newSeed());
    const b = identityFromSeed(newSeed());
    const box = sealTo(text(""), b.boxPub, a.boxPriv, ALICE, BOB);
    const out = openFrom(box, a.boxPub, b.boxPriv, ALICE, BOB);
    expect(out).not.toBeNull();
    expect(out!.length).toBe(0);
  });
});

describe("sign / verify", () => {
  it("verifies a genuine signature", () => {
    const id = identityFromSeed(newSeed());
    const msg = randomBytes(64);
    expect(verify(sign(msg, id.signPriv), msg, id.signPub)).toBe(true);
  });

  it("rejects a signature from someone else — this is what makes a report believable", () => {
    const real = identityFromSeed(newSeed());
    const faker = identityFromSeed(newSeed());
    const msg = randomBytes(64);
    expect(verify(sign(msg, faker.signPriv), msg, real.signPub)).toBe(false);
  });

  it("rejects a signature over different content", () => {
    const id = identityFromSeed(newSeed());
    const sig = sign(text("I owe you nothing"), id.signPriv);
    expect(verify(sig, text("I owe you 500"), id.signPub)).toBe(false);
  });

  it("returns false for a malformed signature rather than throwing", () => {
    const id = identityFromSeed(newSeed());
    expect(verify(new Uint8Array(10), randomBytes(32), id.signPub)).toBe(false);
  });
});
