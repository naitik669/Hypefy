"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Identity } from "@/lib/e2ee/crypto";
import { currentIdentity, fetchPublicKeys, type PublicKeys } from "@/lib/e2ee/vault";
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

/** Everything needed to read envelopes from a set of people. */
export type Reader = {
  /** Our identity, if this device is unlocked for this account. */
  me: Identity | null;
  /** Public halves by user id. Missing means they have no keys yet. */
  peers: Map<string, PublicKeys>;
  /** Still fetching — nothing should be called unreadable on this state. */
  loading: boolean;
};

const NO_PEERS: Map<string, PublicKeys> = new Map();
const IDLE: Reader = { me: null, peers: NO_PEERS, loading: false };

/**
 * Load our identity and the public keys of everyone named, once.
 *
 * Keyed on the sorted peer list, so a parent re-render does not refetch and
 * a new conversation appearing in the inbox does.
 */
export function useEnvelopeReader(myId: string, peerIds: string[], enabled = true): Reader {
  const key = useMemo(
    () => (enabled ? [...new Set(peerIds.filter(Boolean))].sort().join(",") : ""),
    [enabled, peerIds],
  );
  const stamp = enabled && myId && key ? `${myId}|${key}` : null;
  // Held with the stamp it was loaded for, so a change of thread shows as
  // loading rather than briefly answering with the previous thread's keys.
  const [loaded, setLoaded] = useState<{ stamp: string; reader: Reader } | null>(null);
  const asked = useRef<string | null>(null);

  useEffect(() => {
    if (!stamp || asked.current === stamp) return;
    asked.current = stamp;

    let alive = true;
    (async () => {
      const me = await currentIdentity(myId);
      const peers = await fetchPublicKeys(key.split(","));
      if (alive) setLoaded({ stamp, reader: { me, peers, loading: false } });
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
  reader: Reader,
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
 * someone who has not opened the app since encryption shipped. The caller
 * sends plaintext and tells the thread so.
 */
export function sealFor(
  reader: Reader,
  args: { plaintext: string; conversationId: string; myId: string; peerId: string },
): string | null {
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
  return !!reader.me && reader.peers.has(peerId);
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
const peerCache = new Map<string, PublicKeys | null>();

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

    if (!peerCache.has(args.peerId)) {
      const fetched = await fetchPublicKeys([args.peerId]);
      peerCache.set(args.peerId, fetched.get(args.peerId) ?? null);
    }
    const peer = peerCache.get(args.peerId) ?? null;
    if (!peer) return { state: "locked" };

    return openEnvelope({ me, peers: new Map([[args.peerId, peer]]), loading: false }, args);
  } catch {
    return { state: "locked" };
  }
}
