import type { Track } from "@/lib/music";
import type { Trim } from "@/lib/shot-trim";

/**
 * A Shot or a Show put down half-made, to pick up later.
 *
 * Kept on the device, not on the server: nothing has been published, and a
 * clip nobody has decided to post has no business being uploaded. So a draft
 * lives in this browser or this install of the app and nowhere else. It does
 * not follow you to another phone, and clearing the app's storage clears it.
 *
 * Nothing in here throws. A private window or a WebView with storage turned
 * off means "drafts are not available", which the creator says in words; it
 * must never be the reason the creator fails to open.
 */

const DB = "hypefy-drafts";
const DB_VERSION = 1;
const STORE = "drafts";

/**
 * How many one person may hold. A Shot can be 50MB, so this is a limit on
 * how much of someone's phone a forgotten pile of drafts can take.
 */
export const MAX_DRAFTS = 5;

export type DraftEdit = { duration: number; trim: Trim; coverTime: number | null };

export type CreationDraft = {
  id: string;
  /** Whose it is: more than one account can use the same device. */
  userId: string;
  mode: "shot" | "show";
  file: File;
  /** A still to recognise it by in the list. */
  thumb: Blob | null;
  track: Track | null;
  /** Null for a Show, and for a Shot that was never through the editor. */
  edit: DraftEdit | null;
  caption: string;
  savedAt: number;
};

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
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

function everything(db: IDBDatabase): Promise<CreationDraft[]> {
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result ?? []) as CreationDraft[]);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

/** This person's drafts on this device, newest first. */
export async function listDrafts(userId: string): Promise<CreationDraft[]> {
  const db = await open();
  if (!db) return [];
  const all = await everything(db);
  db.close();
  return all.filter((d) => d.userId === userId).sort((a, b) => b.savedAt - a.savedAt);
}

/**
 * Keep a draft. Saving one that is already kept (same id) replaces it, and
 * so never counts against the limit.
 *
 * "full": they are at the limit and this would be one more.
 * "failed": the device would not take it: no storage, or no room.
 */
export async function saveDraft(draft: CreationDraft): Promise<"saved" | "full" | "failed"> {
  const db = await open();
  if (!db) return "failed";
  const mine = (await everything(db)).filter((d) => d.userId === draft.userId);
  if (mine.length >= MAX_DRAFTS && !mine.some((d) => d.id === draft.id)) {
    db.close();
    return "full";
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(draft);
      tx.oncomplete = () => {
        db.close();
        resolve("saved");
      };
      // A 50MB clip on a nearly full phone ends here, as a quota error.
      const fail = () => {
        db.close();
        resolve("failed");
      };
      tx.onerror = fail;
      tx.onabort = fail;
    } catch {
      db.close();
      resolve("failed");
    }
  });
}

export async function deleteDraft(id: string): Promise<void> {
  const db = await open();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
}
