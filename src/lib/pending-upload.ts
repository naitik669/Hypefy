/**
 * An upload that was still going when the app went away.
 *
 * Nothing survived a reload. Close the app mid-upload — or let the WebView
 * be reclaimed, which a phone does to a backgrounded app all the time —
 * and the Files were gone with the page, so the work was gone too. The
 * retry banner only ever existed for the length of one session.
 *
 * This keeps the payload beside the drafts, in IndexedDB, because it holds
 * Files and nothing else will. Same store shape and the same refusal to
 * throw: a private window or a WebView with storage off means "this is not
 * available", never an error in front of somebody who was only posting.
 *
 * ── it does not resume by itself, on purpose ────────────────────────────
 *
 * On the next launch this becomes the same banner a failed upload leaves,
 * with the same Retry. It is not re-sent automatically, and the reason is
 * the one window this design cannot close: the row is written at the END
 * of an upload, and the record is cleared immediately after. If the app
 * dies in between — milliseconds, against minutes of uploading — the post
 * exists AND the record survives.
 *
 * Auto-resuming would then post it twice. A banner asks instead, and
 * somebody who can see the post in their own feed will dismiss it. A
 * duplicate post is a worse outcome than a question.
 */

import type { Track } from "@/lib/music";
import type { Trim } from "@/lib/shot-trim";
import type { ShowAudience } from "@/lib/show-audience";
import type { PostPick } from "@/lib/post-compose";

const DB = "hypefy-drafts";
const DB_VERSION = 2;
const STORE = "pending-upload";

/** Enough of a post to send it again. Mirrors PostUpload. */
export type PendingPost = {
  kind: "post";
  userId: string;
  files: PostPick[];
  caption: string | null;
  body: string | null;
  hashtags: string[];
  mentions: string[];
  track: Track | null;
  poll: { options: string[] } | null;
  aspectRatio: number | null;
  scheduledAt: string | null;
};

/** Enough of a Shot to send it again. Mirrors ShotUpload. */
export type PendingShot = {
  kind: "shot";
  userId: string;
  file: File;
  caption: string | null;
  hashtags: string[];
  mentions: string[];
  track: Track | null;
  coverTime: number | null;
  duration: number;
  trim: Trim;
  audience: ShowAudience;
  scheduledAt: string | null;
};

export type PendingUpload = (PendingPost | PendingShot) & {
  /** Whose it is: more than one account can use the same device. */
  id: string;
  savedAt: number;
};

/** One at a time — the provider only ever has one upload in flight. */
const KEY = "current";

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB, DB_VERSION);
    } catch {
      return resolve(null);
    }
    // The drafts store shares this database and must survive the version
    // bump: onupgradeneeded runs for BOTH stores, and creating only the new
    // one without this guard would be fine, while dropping the old one
    // would quietly delete everybody's drafts.
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("drafts")) {
        db.createObjectStore("drafts", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

/**
 * Remember what is going up, so a reload does not lose it.
 *
 * Takes the two shapes directly rather than Omit<PendingUpload, …>: Omit
 * over a union keeps only the keys BOTH members share, so that version
 * had neither `files` nor `file` on it and rejected every payload.
 */
export async function keepPending(upload: PendingPost | PendingShot): Promise<void> {
  const db = await open();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ ...upload, id: KEY, savedAt: Date.now() });
      tx.oncomplete = () => resolve();
      // A 50MB clip on a nearly full phone ends here as a quota error, and
      // an upload that cannot be remembered is still an upload.
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
}

/** What was going up when the app went away, for this person. */
export async function readPending(userId: string): Promise<PendingUpload | null> {
  const db = await open();
  if (!db) return null;
  const found = await new Promise<PendingUpload | null>((resolve) => {
    try {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as PendingUpload) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  db.close();
  // Somebody else's, on a shared device, is not yours to be offered.
  return found && found.userId === userId ? found : null;
}

/** It finished, or was cancelled, or was given up on. */
export async function clearPending(): Promise<void> {
  const db = await open();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
}
