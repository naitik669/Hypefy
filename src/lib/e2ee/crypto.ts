/**
 * The cryptographic primitives, and nothing else.
 *
 * Pure functions over bytes: no storage, no network, no React. Everything
 * that decides *when* to encrypt lives elsewhere, so the parts that must be
 * correct can be tested on their own.
 *
 * Built on @noble — curves, ciphers and hashes — rather than libsodium.
 * Noble is audited, pure TypeScript, about a tenth of the size, and needs no
 * WASM readiness step, which matters when the first thing a chat screen does
 * is decrypt. The plan named libsodium-wrappers-sumo for its Argon2id;
 * @noble/hashes has Argon2id too.
 *
 * Nothing here is novel. X25519 for agreement, HKDF to turn the shared
 * secret into a key, XChaCha20-Poly1305 to encrypt, Ed25519 to sign,
 * Argon2id to stretch a password. Rolling anything cleverer would be a
 * mistake.
 */

import { x25519, ed25519 } from "@noble/curves/ed25519.js";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { argon2id } from "@noble/hashes/argon2.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";

/** XChaCha20-Poly1305 takes a 24-byte nonce — wide enough to pick at random. */
const NONCE = 24;
/** Every symmetric key here is 32 bytes. */
export const KEY_BYTES = 32;
/** Argon2id salt. */
export const SALT_BYTES = 16;

/**
 * Argon2id cost.
 *
 * OWASP's recommendation: 19 MiB, two passes, one lane. Around 200ms in
 * Node and a second or two in a WebView on a mid-range phone — paid once
 * when unlocking on a new device, never per message.
 */
const ARGON = { t: 2, m: 19456, p: 1, dkLen: KEY_BYTES } as const;

const utf8 = new TextEncoder();

export function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

// ── base64, for anything that has to survive as text ───────────────────

export function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ── stretching a password or a recovery code into a key ────────────────

/**
 * A key-encryption key from something a person can remember or write down.
 *
 * Deliberately slow. This is the only thing standing between a stolen
 * database of wrapped keys and the messages behind them.
 */
export function deriveKek(secret: string, salt: Uint8Array): Uint8Array {
  return argon2id(utf8.encode(secret.normalize("NFKC")), salt, ARGON);
}

// ── wrapping a key under another key ───────────────────────────────────

/**
 * Encrypt `key` under `kek`. The nonce is random and rides in front of the
 * ciphertext, so a wrapped blob is one opaque value to store.
 */
export function wrap(key: Uint8Array, kek: Uint8Array): Uint8Array {
  const nonce = randomBytes(NONCE);
  const ct = xchacha20poly1305(kek, nonce).encrypt(key);
  const out = new Uint8Array(nonce.length + ct.length);
  out.set(nonce);
  out.set(ct, nonce.length);
  return out;
}

/**
 * The reverse. Returns null rather than throwing when the kek is wrong —
 * a wrong password is an ordinary event, not an exception.
 */
export function unwrap(blob: Uint8Array, kek: Uint8Array): Uint8Array | null {
  if (blob.length <= NONCE) return null;
  try {
    return xchacha20poly1305(kek, blob.slice(0, NONCE)).decrypt(blob.slice(NONCE));
  } catch {
    return null;
  }
}

// ── identity ───────────────────────────────────────────────────────────

export type Identity = {
  /** X25519, for agreeing a key with someone. */
  boxPub: Uint8Array;
  boxPriv: Uint8Array;
  /** Ed25519, for proving a message came from you. */
  signPub: Uint8Array;
  signPriv: Uint8Array;
};

/**
 * Both keypairs from one 32-byte seed.
 *
 * Separated through HKDF with different labels rather than used directly, so
 * the signing key and the encryption key are independent — reusing one
 * secret across two algorithms is a well-known way to lose both.
 */
export function identityFromSeed(seed: Uint8Array): Identity {
  const boxPriv = hkdf(sha256, seed, undefined, utf8.encode("hypefy/e2ee/box/v1"), 32);
  const signPriv = hkdf(sha256, seed, undefined, utf8.encode("hypefy/e2ee/sign/v1"), 32);
  return {
    boxPriv,
    boxPub: x25519.getPublicKey(boxPriv),
    signPriv,
    signPub: ed25519.getPublicKey(signPriv),
  };
}

/** A fresh identity seed. Everything else follows from it. */
export function newSeed(): Uint8Array {
  return randomBytes(KEY_BYTES);
}

// ── sealing a message to someone ───────────────────────────────────────

/**
 * The context a sealed box is bound to.
 *
 * Passed as additional data, so a ciphertext lifted from one pair of people
 * cannot be replayed as if it belonged to another. It is authenticated but
 * not encrypted — it is already public knowledge.
 */
function aad(senderId: string, recipientId: string): Uint8Array {
  return utf8.encode(`hypefy/e2ee/v1|${senderId}|${recipientId}`);
}

/** The agreed key for one direction of one pair. */
function sharedKey(priv: Uint8Array, pub: Uint8Array): Uint8Array {
  // The raw X25519 output is not uniformly random and must never be used as
  // a cipher key directly.
  return hkdf(sha256, x25519.getSharedSecret(priv, pub), undefined, utf8.encode("hypefy/e2ee/msg/v1"), 32);
}

export type SealedBox = { n: string; c: string };

export function sealTo(
  plaintext: Uint8Array,
  recipientBoxPub: Uint8Array,
  senderBoxPriv: Uint8Array,
  senderId: string,
  recipientId: string,
): SealedBox {
  const nonce = randomBytes(NONCE);
  const key = sharedKey(senderBoxPriv, recipientBoxPub);
  const ct = xchacha20poly1305(key, nonce, aad(senderId, recipientId)).encrypt(plaintext);
  return { n: toB64(nonce), c: toB64(ct) };
}

/** Null when it was not for us, was tampered with, or came from someone else. */
export function openFrom(
  box: SealedBox,
  senderBoxPub: Uint8Array,
  recipientBoxPriv: Uint8Array,
  senderId: string,
  recipientId: string,
): Uint8Array | null {
  try {
    const key = sharedKey(recipientBoxPriv, senderBoxPub);
    return xchacha20poly1305(key, fromB64(box.n), aad(senderId, recipientId)).decrypt(fromB64(box.c));
  } catch {
    return null;
  }
}

// ── signing, so a report can be believed ───────────────────────────────

export function sign(message: Uint8Array, signPriv: Uint8Array): Uint8Array {
  return ed25519.sign(message, signPriv);
}

export function verify(signature: Uint8Array, message: Uint8Array, signPub: Uint8Array): boolean {
  try {
    return ed25519.verify(signature, message, signPub);
  } catch {
    return false;
  }
}
