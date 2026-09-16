"use client";

import { shrinkForComment } from "@/lib/comment-photo";
import type { AlbumItem } from "@/lib/chat-album";

/**
 * Getting a folder's files into the chat bucket.
 *
 * Phone photos are shrunk first: a folder of full 12MP originals sent all at
 * once over mobile data is what left folders stuck on the sending dots, one
 * or two photos arriving a minute apart. Two go up at a time, each with a
 * time limit, so a folder always ends — sent, or failed with Retry.
 *
 * Every file is read into memory before it goes. Android's WebView streams a
 * picked File from its content provider at upload time, and for some gallery
 * files that read fails: the request's preflight goes out and the upload
 * itself never does, every time, Retry included. Bytes already in memory
 * don't depend on the provider any more.
 */

/** Long edge a chat photo is shrunk to. Full screen on a phone, no more. */
export const ALBUM_PHOTO_MAX_EDGE = 2048;
/** Uploads running at once. */
const PARALLEL = 2;
/** A single file that takes longer than this has failed. */
export const UPLOAD_TIMEOUT_MS = 90_000;

export type AlbumFile = { file: File; type: "image" | "video"; url?: string };

type Bucket = {
  upload: (path: string, body: Blob, opts: { contentType: string }) => Promise<{ error: unknown }>;
  getPublicUrl: (path: string) => { data: { publicUrl: string } };
};

/** The file's bytes, now. FileReader where Blob.arrayBuffer is missing. */
function readBytes(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | "timeout"> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => resolve("timeout"), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

/**
 * Uploads what hasn't been uploaded yet, writing each URL back onto its entry
 * so a retry only sends the ones that failed. Returns the items when all are
 * up, or null.
 */
export async function uploadAlbumFiles(
  files: AlbumFile[],
  bucket: Bucket,
  userId: string,
  { timeoutMs = UPLOAD_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<AlbumItem[] | null> {
  const stamp = Date.now();
  let next = 0;

  async function one(entry: AlbumFile, i: number) {
    if (entry.url) return;
    try {
      const picked =
        entry.type === "image" ? await shrinkForComment(entry.file, ALBUM_PHOTO_MAX_EDGE) : entry.file;
      const contentType = picked.type || entry.file.type;
      const body = new Blob([await readBytes(picked)], { type: contentType });
      const ext =
        entry.type === "video"
          ? entry.file.name.split(".").pop() || "mp4"
          : contentType === "image/png" ? "png" : contentType === "image/gif" ? "gif" : contentType === "image/webp" ? "webp" : "jpg";
      const path = `${userId}/${stamp}-${i}.${ext}`;
      const res = await withTimeout(bucket.upload(path, body, { contentType }), timeoutMs);
      if (res === "timeout" || res.error) return;
      entry.url = bucket.getPublicUrl(path).data.publicUrl;
    } catch {
      /* stays without a url, so the folder fails and can be retried */
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(PARALLEL, files.length) }, async () => {
      while (next < files.length) {
        const i = next++;
        await one(files[i], i);
      }
    }),
  );

  if (files.some((f) => !f.url)) return null;
  return files.map((f) => ({ url: f.url!, type: f.type }));
}
