"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Identity } from "@/lib/e2ee/crypto";
import {
  E2EE_CHANGED,
  currentIdentity,
  encryptionState,
  fetchPublicKeys,
  type EncryptionState,
  type PublicKeys,
} from "@/lib/e2ee/vault";
import { decryptText, encryptText, parseEnvelope } from "@/lib/e2ee/message";

/**
 * Encryption as a chat screen sees it.
 *
 * message.ts knows how to seal bytes; vault.ts knows where the keys live.
 * This is the piece that answers the only two questions a screen actually
 * asks: can I encrypt what I am about to send, and can I read what arrived.
 *
 * Deliberately narrow — 1:1 text. Groups need sender keys and a re-key when
 * somebody joins; chat media sits in a public bucket. Both are their own
 * piece of work, and everything outside this scope stays plaintext.
 */

/**
 * What is needed to read an envelope: who we are on this device, and the
 * public halves of the people who might have written one.
 */
export type Keys = {
  /** Our identity, if this device is unlocked for this account. */
  me: Identity | null;
  /** Public halves by user id. Missing means no confirmed keys yet. */
  peers: Map<string, PublicKeys>;
};

/** What is needed to send one, which is strictly more. */
export type Reader = Keys & {
  /**
   * Where this account stands on this device. Only "ready" encrypts.
   *
   * Reading and sending are gated differently on purpose. A device that holds
   * the keys can read what arrives whether or not the recovery code was ever
   * confirmed — but it must not start *sending* under a vault whose only
   * backup nobody has seen, or a cleared browser would take that history with
   * it and leave nothing to recover from.
   */
  self: EncryptionState["state"];
  /** Still fetching — nothing should be called unreadable on this state. */
  loading: boolean;
};

const NO_PEERS: Map<string, PublicKeys> = new Map();
const IDLE: Reader = { me: null, peers: NO_PEERS, self: "unavailable", loading: false };

/**
 * Load our identity, where we stand, and the public keys of everyone named.
 *
 * Keyed on the sorted peer list, so a parent re-render does not refetch and
 * a new conversation appearing in the inbox does. Re-reads when the state
 * changes underneath it — setting up, confirming or unlocking from a sheet
 * that is not part of this screen — via `E2EE_CHANGED`.
 */
export function useEnvelopeReader(myId: string, peerIds: string[], enabled = true): Reader {
  const key = useMemo(
    () => (enabled ? [...new Set(peerIds.filter(Boolean))].sort().join(",") : ""),
    [enabled, peerIds],
  );
  const [epoch, setEpoch] = useState(0);
  const stamp = enabled && myId && key ? `${myId}|${key}|${epoch}` : null;
  // Held with the stamp it was loaded for, so a change of thread shows as
  // loading rather than briefly answering with the previous thread's keys.
  const [loaded, setLoaded] = useState<{ stamp: string; reader: Reader } | null>(null);
  const asked = useRef<string | null>(null);

  useEffect(() => {
    const bump = () => setEpoch((e) => e + 1);
    window.addEventListener(E2EE_CHANGED, bump);
    return () => window.removeEventListener(E2EE_CHANGED, bump);
  }, []);

  useEffect(() => {
    if (!stamp || asked.current === stamp) return;
    asked.current = stamp;

    let alive = true;
    (async () => {
      const me = await currentIdentity(myId);
      const [peers, self] = await Promise.all([
        fetchPublicKeys(key.split(",")),
        encryptionState(myId),
      ]);
      if (alive) setLoaded({ stamp, reader: { me, peers, self: self.state, loading: false } });
    })().catch(() => {
      if (alive) setLoaded({ stamp, reader: IDLE });
    });

    return () => {
      alive = false;
    };
  }, [stamp, myId, key]);

  if (!stamp) return IDLE;
  return loaded?.stamp === stamp ? loaded.reader : { ...IDLE, loading: true };
}

export type Opened =
  /** Not encrypted at all — every message sent before this shipped. */
  | { state: "plain" }
  /** Encrypted, and we read it. */
  | { state: "open"; text: string }
  /** Encrypted and unreadable here: locked device, or rotated keys. */
  | { state: "locked" };

/**
 * Read one message off the wire.
 *
 * Both copies in an envelope are sealed under the same sender|recipient
 * label, so opening our own uses the pair rather than our id twice — which
 * is why the peer has to be named even for a message we sent ourselves.
 */
export function openEnvelope(
  reader: Keys,
  args: { body: string | null; senderId: string; myId: string; peerId: string },
): Opened {
  const envelope = parseEnvelope(args.body);
  if (!envelope) return { state: "plain" };

  const { me, peers } = reader;
  const peer = peers.get(args.peerId);
  if (!me || !peer) return { state: "locked" };

  const fromMe = args.senderId === args.myId;
  const text = decryptText({
    envelope,
    me,
    myId: args.myId,
    senderId: args.senderId,
    senderBoxPub: fromMe ? me.boxPub : peer.boxPub,
    recipientId: fromMe ? args.peerId : args.myId,
  });
  return text === null ? { state: "locked" } : { state: "open", text };
}

/**
 * Seal one outgoing message, or null when we cannot.
 *
 * Null is not a failure to report — it is the ordinary state of talking to
 * someone who has not set up encryption yet, or of not having finished
 * setting it up yourself. The caller tells the thread which, and must never
 * describe a plaintext message as encrypted.
 *
 * Requires *our own* vault to be confirmed, not only the peer's: this is
 * the gate that keeps a half-finished setup from being relied upon.
 */
export function sealFor(
  reader: Reader,
  args: { plaintext: string; conversationId: string; myId: string; peerId: string },
): string | null {
  if (reader.self !== "ready") return null;
  const peer = reader.peers.get(args.peerId);
  if (!reader.me || !peer) return null;
  try {
    return encryptText({
      plaintext: args.plaintext,
      conversationId: args.conversationId,
      sender: reader.me,
      senderId: args.myId,
      recipientId: args.peerId,
      recipientBoxPub: peer.boxPub,
    });
  } catch {
    return null;
  }
}

/** Will new messages to this person actually be encrypted? */
export function canEncrypt(reader: Reader, peerId: string): boolean {
  return reader.self === "ready" && !!reader.me && reader.peers.has(peerId);
}

/** Is this body encrypted, without needing any keys to answer? */
export function isEncrypted(body: string | null): boolean {
  return parseEnvelope(body) !== null;
}

/**
 * Read one envelope outside React, fetching whatever it needs.
 *
 * For the in-app toast, which sees a single message arrive and has no thread
 * around it. Public keys are cached for the tab's lifetime — they only change
 * when somebody rebuilds their identity, and a stale one simply shows the
 * message as locked rather than showing the wrong words.
 */
const peerCache = new Map<string, PublicKeys>();

export async function openIncoming(args: {
  body: string | null;
  senderId: string;
  myId: string;
  peerId: string;
}): Promise<Opened> {
  if (!parseEnvelope(args.body)) return { state: "plain" };
  try {
    const me = await currentIdentity(args.myId);
    if (!me) return { state: "locked" };

    let peer = peerCache.get(args.peerId);
    if (!peer) {
      const fetched = await fetchPublicKeys([args.peerId]);
      peer = fetched.get(args.peerId);
      // Only successes are kept. Remembering "no keys" would show a message
      // from somebody who enrolled a minute ago as locked until the tab
      // was reloaded.
      if (peer) peerCache.set(args.peerId, peer);
    }
    if (!peer) return { state: "locked" };

    return openEnvelope({ me, peers: new Map([[args.peerId, peer]]) }, args);
  } catch {
    return { state: "locked" };
  }
}
