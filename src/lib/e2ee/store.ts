"use client";

import { identityFromSeed, type Identity } from "@/lib/e2ee/crypto";

/**
 * Where an unlocked identity lives on this device.
 *
 * IndexedDB, and this is the first use of it in the app — there is no
 * existing schema or versioning to follow, so the shape here sets the
 * precedent. It holds the 32-byte seed rather than the derived keys: the
 * keypairs come back from it in microseconds, and one field is less to keep
 * consistent.
 *
 * **Keyed by user id, not by origin.** Hypefy lets one device hold several
 * accounts — saved-accounts.ts keeps a session per account and the switcher
 * swaps between them in place. A store keyed only by origin would hand one
 * account's private key to another the moment someone switched. Every read
 * and write here takes the user it belongs to.
 *
 * Nothing in here throws. A private window, a cleared profile, an old
 * WebView with IndexedDB disabled — all of them mean "no identity on this
 * device", which is a state the app already has to handle, and none of them
 * should take the chat screen down with them.
 */

const DB = "hypefy-e2ee";
const DB_VERSION = 1;
const STORE = "identities";

type Row = { userId: string; seed: Uint8Array; savedAt: number };

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB, DB_VERSION);
    } catch {
      return resolve(null);
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "userId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    // Another tab holding an old version open would otherwise hang forever.
    req.onblocked = () => resolve(null);
  });
}

function run<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return new Promise((resolve) => {
    void open().then((db) => {
      if (!db) return resolve(null);
      try {
        const tx = db.transaction(STORE, mode);
        const req = work(tx.objectStore(STORE));
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => resolve(null);
        tx.onabort = () => resolve(null);
        tx.oncomplete = () => db.close();
      } catch {
        resolve(null);
      }
    });
  });
}

/** Keep this device unlocked for that user. */
export async function saveIdentity(userId: string, seed: Uint8Array): Promise<void> {
  const row: Row = { userId, seed, savedAt: Date.now() };
  await run("readwrite", (s) => s.put(row));
}

/**
 * The identity for that user, if this device has been unlocked for them.
 *
 * Null means "ask them to unlock", not "something broke" — a fresh device,
 * a signed-out account and a browser with no IndexedDB all land here.
 */
export async function loadIdentity(userId: string): Promise<Identity | null> {
  const row = (await run<Row>("readonly", (s) => s.get(userId) as IDBRequest<Row>)) ?? null;
  if (!row?.seed) return null;
  // Structured clone gives back a plain Uint8Array; be defensive anyway,
  // since a row written by an older version might not be one.
  const seed = row.seed instanceof Uint8Array ? row.seed : new Uint8Array(row.seed);
  if (seed.length !== 32) return null;
  return identityFromSeed(seed);
}

/** The raw seed, for re-wrapping under a new password. */
export async function loadSeed(userId: string): Promise<Uint8Array | null> {
  const row = (await run<Row>("readonly", (s) => s.get(userId) as IDBRequest<Row>)) ?? null;
  if (!row?.seed) return null;
  const seed = row.seed instanceof Uint8Array ? row.seed : new Uint8Array(row.seed);
  return seed.length === 32 ? seed : null;
}

/** Has this device been unlocked for that user? */
export async function hasIdentity(userId: string): Promise<boolean> {
  return (await loadSeed(userId)) !== null;
}

/**
 * Forget one account's key.
 *
 * Must be called when an account is removed from the switcher, not only on
 * sign-out: a device that has "forgotten" an account should not still be
 * able to read its messages.
 */
export async function forgetIdentity(userId: string): Promise<void> {
  await run("readwrite", (s) => s.delete(userId));
}

/** Forget every account's key on this device. */
export async function forgetAllIdentities(): Promise<void> {
  await run("readwrite", (s) => s.clear());
}
