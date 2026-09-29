/**
 * What an encrypted message looks like on the wire.
 *
 * `messages.body` becomes a JSON envelope instead of text. The server stores
 * and delivers it without being able to open it; `send_message` needs no
 * change, because all it ever asked of a body was that it not be empty.
 *
 * Pure. No storage, no network — the pieces that must be right are testable
 * on their own.
 */

import {
  fromB64,
  openFrom,
  sealTo,
  sign,
  toB64,
  verify,
  type Identity,
  type SealedBox,
} from "@/lib/e2ee/crypto";

/** Bumped only if the envelope's shape changes. Old messages keep their own. */
export const ENVELOPE_V = 1;

export type Envelope = {
  v: number;
  /** One sealed copy per person who may read it, by user id. */
  boxes: Record<string, SealedBox>;
  /** Ed25519 over the plaintext and its context. See `signedBytes`. */
  sig: string;
};

const utf8 = new TextEncoder();
const utf8d = new TextDecoder();

/**
 * Exactly what the sender signs.
 *
 * The plaintext, prefixed with the conversation and both parties, so a
 * signature cannot be lifted out of one exchange and presented as belonging
 * to another.
 *
 * This is a deliberate trade and worth naming. Signal signs nothing for this
 * reason — a MAC proves a message to its recipient but proves nothing to
 * anyone else, which is what "deniability" means there. Signing the
 * plaintext gives that up: a recipient can now prove to a third party that
 * you sent particular words.
 *
 * We are giving it up on purpose. Reports have to be actionable — without a
 * signature a reporter could paste any text they liked and attribute it to
 * anyone, and a moderator would have no way to tell.
 */
function signedBytes(
  plaintext: string,
  conversationId: string,
  senderId: string,
  recipientId: string,
): Uint8Array {
  const prefix = utf8.encode(
    `hypefy/e2ee/sig/v1|${conversationId}|${senderId}|${recipientId}|`,
  );
  const body = utf8.encode(plaintext);
  const out = new Uint8Array(prefix.length + body.length);
  out.set(prefix);
  out.set(body, prefix.length);
  return out;
}

/**
 * Seal a message for the other person and for yourself.
 *
 * Two copies. Without the second, your own history would be unreadable on
 * your next phone — you would have sent something only they could open.
 */
export function encryptText(args: {
  plaintext: string;
  conversationId: string;
  sender: Identity;
  senderId: string;
  recipientId: string;
  recipientBoxPub: Uint8Array;
}): string {
  const { plaintext, conversationId, sender, senderId, recipientId, recipientBoxPub } = args;
  const bytes = utf8.encode(plaintext);

  const envelope: Envelope = {
    v: ENVELOPE_V,
    boxes: {
      [recipientId]: sealTo(bytes, recipientBoxPub, sender.boxPriv, senderId, recipientId),
      // Sealed to ourselves, under the same pair label, so opening it later
      // uses the identical context.
      [senderId]: sealTo(bytes, sender.boxPub, sender.boxPriv, senderId, recipientId),
    },
    sig: toB64(sign(signedBytes(plaintext, conversationId, senderId, recipientId), sender.signPriv)),
  };

  return JSON.stringify(envelope);
}

/** Is this body an envelope rather than plain text? */
export function parseEnvelope(body: string | null): Envelope | null {
  if (!body || body[0] !== "{") return null;
  try {
    const parsed = JSON.parse(body) as Partial<Envelope>;
    if (typeof parsed?.v !== "number" || !parsed.boxes || typeof parsed.sig !== "string") {
      return null;
    }
    return parsed as Envelope;
  } catch {
    return null;
  }
}

/**
 * Open a message meant for us.
 *
 * Null when it cannot be opened — a message from before this device was
 * unlocked, an envelope from a version we do not understand, a sender whose
 * keys have changed. The caller shows "can't read this" rather than crashing
 * a thread over one row.
 */
export function decryptText(args: {
  envelope: Envelope;
  me: Identity;
  myId: string;
  senderId: string;
  senderBoxPub: Uint8Array;
  recipientId: string;
}): string | null {
  const { envelope, me, myId, senderId, senderBoxPub, recipientId } = args;
  if (envelope.v !== ENVELOPE_V) return null;

  const box = envelope.boxes[myId];
  if (!box) return null;

  // Both copies were sealed under the same sender|recipient label, so
  // reading our own back uses the pair, not our own id twice.
  const opened = openFrom(box, senderBoxPub, me.boxPriv, senderId, recipientId);
  return opened ? utf8d.decode(opened) : null;
}

/**
 * Did this person really send these words?
 *
 * What makes a report worth acting on. The reporter supplies the plaintext
 * their device decrypted; this checks it against the signature the sender
 * made and the public key the server holds for them.
 */
export function verifyAuthorship(args: {
  plaintext: string;
  envelope: Envelope;
  conversationId: string;
  senderId: string;
  recipientId: string;
  senderSignPub: Uint8Array;
}): boolean {
  const { plaintext, envelope, conversationId, senderId, recipientId, senderSignPub } = args;
  try {
    return verify(
      fromB64(envelope.sig),
      signedBytes(plaintext, conversationId, senderId, recipientId),
      senderSignPub,
    );
  } catch {
    return false;
  }
}
