"use client";

import { useMemo, useSyncExternalStore } from "react";

import type { ChatMsg } from "@/lib/chat-thread";

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

/** Enough of a delivered message to tell whether it is one of ours. */
export type SentLike = { sender_id: string; body: string | null; created_at: string };

/**
 * How close in time a delivered message has to be to count as the same one.
 *
 * Generous, because the whole point is that the send succeeded some time
 * after it was written — but not unbounded, or saying the same short thing
 * twice in a day would silently swallow the second one.
 */
const SAME_MESSAGE_MS = 60 * 60 * 1000;

/**
 * Which unsent messages should go back into the thread.
 *
 * All of them, minus any that evidently arrived. An entry that has not
 * spent its attempts is not a message on its way — nothing is retrying it
 * across a restart — so leaving it out would mean a message sitting in
 * storage that cannot be seen and cannot be sent. It comes back too; how
 * it is drawn is isTerminal's business, not this one's.
 *
 * One that evidently arrived is dropped instead of drawn. The app can be
 * killed in the gap between the server accepting a message and the outbox
 * row being deleted; the row survives, the message is genuinely in the
 * thread, and without this the sender sees their own message twice — once
 * real, once marked as never sent. The ids cannot be compared, because the
 * real row has a server uuid and this has only the temporary one, so the
 * comparison is what the server would have received, from us, at about the
 * right time.
 *
 * A message with no body is never matched this way. A OneShot carries none
 * by design, so two of them would look identical and the second would
 * vanish.
 */
export function toRestore(
  entries: OutboxEntry[],
  sent: SentLike[],
  myId: string,
): OutboxEntry[] {
  const arrived = (e: OutboxEntry) =>
    e.wire !== null &&
    sent.some(
      (s) =>
        s.sender_id === myId &&
        s.body === e.wire &&
        Math.abs(new Date(s.created_at).getTime() - new Date(e.createdAt).getTime()) <=
          SAME_MESSAGE_MS,
    );

  return entries
    .filter((e) => !arrived(e))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * One unsent message, as the thread draws its own.
 *
 * `body` holds exactly what the server would have held — the envelope for
 * a sealed chat — so the decrypt the thread already runs over everything
 * arriving covers this too, and nothing about a restored message is a
 * special case downstream.
 *
 * It keeps its original id, because the thread has records under that id
 * already: an album's files on this device, a OneShot's storage path. A
 * fresh id would orphan all of them. And it keeps its original time, or a
 * message written last night reappears this morning at the foot of the
 * thread, under replies it never saw.
 */
export function restoredMessage(entry: OutboxEntry, myId: string): ChatMsg {
  return {
    id: entry.tempId,
    body: entry.wire,
    // Yours, always: the outbox is per account and only ever holds what
    // you tried to send. Without this the thread draws it as the other
    // person's, on the wrong side, with their face on it.
    sender_id: myId,
    kind: entry.kind,
    post_id: null,
    reply_to_id: entry.replyToId,
    is_unsent: false,
    created_at: entry.createdAt,
    // Spent its attempts: dead, and drawn as such. Otherwise it is still
    // owed a try, and reads as pending until something gives it one.
    _status: isTerminal(entry) ? "failed" : "pending",
    ...(entry.storagePath ? { _storagePath: entry.storagePath } : {}),
    ...(entry.caption ? { _caption: entry.caption } : {}),
  };
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
