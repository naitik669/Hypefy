"use client";

import { useMemo, useSyncExternalStore } from "react";

/**
 * Messages written but not yet sent, kept on the device until they are.
 *
 * Until this existed an unsent message lived only in React state. The thread
 * marked it failed and let you tap to retry, which is fine while you are
 * looking at it — and useless the moment you switch apps, because the state
 * went with the component. Writing one on the underground and finding it
 * gone at the surface is the failure people blame an app for permanently.
 *
 * Kept per account, one key per message, in the same idiom as chat-drafts:
 * separate keys mean a queue that cannot be corrupted wholesale by one
 * half-finished write, and no read-modify-write race between two tabs.
 *
 * What it stores is the careful part. `wire` is exactly what goes to the
 * server — the sealed envelope for an encrypted chat, the plain text
 * otherwise — and never the plaintext of something sealed. A sealed
 * conversation that spilled its contents into localStorage on the way out
 * would have undone the point of sealing it. Redrawing the bubble later
 * works anyway, because openEnvelope can open our own sent copy.
 *
 * Retrying sends that stored envelope verbatim rather than sealing again:
 * the peer may have rotated keys while it sat here, and re-sealing could
 * fail or seal under keys the original recipient no longer holds.
 */

const PREFIX = "hypefy_chat_outbox:";
/** Told to this tab's listeners; other tabs hear the native `storage`. */
const CHANGED = "hypefy:chat-outbox";

/**
 * How many times a message is sent before the thread calls it dead.
 *
 * Counted on the device rather than in memory, so an app that is killed
 * between attempts does not get a fresh budget each launch and retry for
 * ever without ever reaching the state the thread can draw.
 */
export const MAX_ATTEMPTS = 3;

/**
 * How many unsent messages are kept at once.
 *
 * A phone offline for a week must not fill its own disk — and localStorage
 * throwing on quota would take every draft down with it, not just this.
 */
export const MAX_QUEUED = 50;

export type OutboxEntry = {
  /** The optimistic id the thread already drew this message under. */
  tempId: string;
  conversationId: string;
  kind: string;
  /** Exactly what goes on the wire. Never a sealed message's plaintext. */
  wire: string | null;
  /** Whether `wire` is an envelope, so a restore knows to open it. */
  sealed: boolean;
  replyToId: string | null;
  /** When it was written, which is the order the thread redraws them in. */
  createdAt: string;
  attempts: number;
  /** A OneShot's private storage path, so a retry re-sends rather than
   *  re-uploads. Never comes back from the server. */
  storagePath?: string;
  caption?: string;
};

const keyFor = (userId: string, tempId: string) => `${PREFIX}${userId}:${tempId}`;

/** Has this got everything the thread needs to draw and re-send it? */
function usable(v: unknown): v is OutboxEntry {
  if (!v || typeof v !== "object") return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.tempId === "string" &&
    typeof e.conversationId === "string" &&
    typeof e.kind === "string" &&
    typeof e.createdAt === "string" &&
    typeof e.attempts === "number" &&
    typeof e.sealed === "boolean" &&
    (typeof e.wire === "string" || e.wire === null)
  );
}

/**
 * Every unsent message on this device for this account, oldest first.
 *
 * Anything unreadable or half-written is dropped rather than thrown on: a
 * kill in the middle of a write must not leave a thread that cannot open.
 */
export function readOutbox(userId: string): OutboxEntry[] {
  if (!userId || typeof window === "undefined") return [];
  const mine = `${PREFIX}${userId}:`;
  const out: OutboxEntry[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(mine)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed: unknown = JSON.parse(raw);
        if (usable(parsed)) out.push(parsed);
      } catch {
        /* half-written: it is not a message any more */
      }
    }
  } catch {
    return [];
  }
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** The ones belonging to one thread. */
export function outboxFor(userId: string, conversationId: string): OutboxEntry[] {
  return readOutbox(userId).filter((e) => e.conversationId === conversationId);
}

/**
 * Keep one, dropping the oldest if the queue is already full.
 *
 * Never throws. A disk that will not take it costs the promise that the
 * message survives a restart, and nothing else — the send itself carries on.
 */
export function queueOutbox(userId: string, entry: OutboxEntry): void {
  if (!userId || typeof window === "undefined") return;
  try {
    const existing = readOutbox(userId).filter((e) => e.tempId !== entry.tempId);
    for (const old of existing.slice(0, Math.max(0, existing.length + 1 - MAX_QUEUED))) {
      localStorage.removeItem(keyFor(userId, old.tempId));
    }
    localStorage.setItem(keyFor(userId, entry.tempId), JSON.stringify(entry));
    window.dispatchEvent(new Event(CHANGED));
  } catch {
    /* private mode, blocked site data, or a full disk */
  }
}

/**
 * Count one send against a message's budget.
 *
 * Returns the entry as it now stands, or null when there is nothing by that
 * id — which is the ordinary case for a message that went while a retry was
 * already in flight.
 */
export function recordAttempt(userId: string, tempId: string): OutboxEntry | null {
  if (!userId || typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(keyFor(userId, tempId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!usable(parsed)) return null;
    const next: OutboxEntry = { ...parsed, attempts: parsed.attempts + 1 };
    localStorage.setItem(keyFor(userId, tempId), JSON.stringify(next));
    window.dispatchEvent(new Event(CHANGED));
    return next;
  } catch {
    return null;
  }
}

/** Forget one: it went, or it was thrown away. */
export function dropOutbox(userId: string, tempId: string): void {
  if (!userId || typeof window === "undefined") return;
  try {
    localStorage.removeItem(keyFor(userId, tempId));
    window.dispatchEvent(new Event(CHANGED));
  } catch {
    /* nothing to do: it is already as gone as it can be */
  }
}

/** Has this one spent its attempts? The thread draws these as "Not sent". */
export function isTerminal(entry: OutboxEntry): boolean {
  return entry.attempts >= MAX_ATTEMPTS;
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * One thread's unsent messages, kept current as they change.
 *
 * Read as a string and parsed, so the thread only redraws when something
 * actually changed. On the server there are none, which is also what the
 * first paint shows before the stored ones are read in.
 */
export function useOutbox(userId: string, conversationId: string): OutboxEntry[] {
  const json = useSyncExternalStore(
    subscribe,
    () => JSON.stringify(outboxFor(userId, conversationId)),
    () => "[]",
  );
  return useMemo(() => JSON.parse(json) as OutboxEntry[], [json]);
}
