"use client";

import { fitWithin } from "@/lib/comment-photo";
import type { AlbumItem } from "@/lib/chat-album";

/**
 * Getting a folder's files into the chat bucket.
 *
 * On a phone's mobile uplink a photo goes up at tens of KB a second: a 250KB
 * photo took about five seconds in the logs, so one unshrunk multi-MB original
 * never finishes and the whole folder fails. Every photo is therefore redrawn
 * small before it goes, with a second way to decode it when the first fails,
 * and the time allowed grows with the size of what is actually sent.
 *
 * The bytes are read into memory first as well: Android's WebView otherwise
 * streams a picked File from its content provider at upload time, which fails
 * for some gallery files.
 */

/** Long edge a chat photo is redrawn to. Sharp full screen on a phone. */
export const ALBUM_PHOTO_MAX_EDGE = 1600;
const QUALITY = 0.82;
const DECODE_TIMEOUT_MS = 8_000;
/** Uploads running at once. */
const PARALLEL = 2;
/** Time allowed for a file: a floor, plus this long per KB sent. */
export const UPLOAD_BASE_MS = 45_000;
const MS_PER_KB = 60;

/** A file to upload, or a photo already uploaded (url set, no file). */
export type AlbumFile = { file?: File; type: "image" | "video"; url?: string };

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

type Decoded = { source: CanvasImageSource; width: number; height: number; done: () => void };

/** Decode a photo two ways: createImageBitmap, then a plain <img>, which
 *  some WebViews manage when the first gives up on a large file. */
async function decode(blob: Blob): Promise<Decoded | null> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
      return { source: bmp, width: bmp.width, height: bmp.height, done: () => bmp.close() };
    } catch {
      /* try the other way */
    }
  }
  if (typeof Image === "undefined" || typeof URL.createObjectURL !== "function") return null;
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      // A photo that neither loads nor errors must not hold the folder up.
      const t = setTimeout(() => reject(new Error("decode")), DECODE_TIMEOUT_MS);
      img.onload = () => { clearTimeout(t); resolve(); };
      img.onerror = () => { clearTimeout(t); reject(new Error("decode")); };
      img.src = url;
    });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, done: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

/** A photo redrawn to the cap as JPEG, or the file itself when it can't be
 *  decoded here (or is a GIF, whose animation a redraw would lose). */
export async function shrinkPhoto(file: File): Promise<Blob> {
  if (file.type === "image/gif") return file;
  const img = await decode(file);
  if (!img || !img.width || !img.height) return file;
  try {
    const out = fitWithin(img.width, img.height, ALBUM_PHOTO_MAX_EDGE);
    if (out.w === img.width && out.h === img.height && file.size < 400_000) return file;
    const canvas = document.createElement("canvas");
    canvas.width = out.w;
    canvas.height = out.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img.source, 0, 0, out.w, out.h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  } finally {
    img.done();
  }
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

/** How long a file of this size gets before it counts as failed. */
export function uploadTimeout(bytes: number, base = UPLOAD_BASE_MS): number {
  return base + Math.ceil(bytes / 1000) * MS_PER_KB;
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
  { baseTimeoutMs = UPLOAD_BASE_MS }: { baseTimeoutMs?: number } = {},
): Promise<AlbumItem[] | null> {
  const stamp = Date.now();
  let next = 0;

  async function one(entry: AlbumFile, i: number) {
    if (entry.url || !entry.file) return;
    const file = entry.file;
    try {
      const picked = entry.type === "image" ? await shrinkPhoto(file) : file;
      const contentType = picked.type || file.type || (entry.type === "video" ? "video/mp4" : "image/jpeg");
      const body = new Blob([await readBytes(picked)], { type: contentType });
      const ext =
        entry.type === "video"
          ? file.name.split(".").pop() || "mp4"
          : contentType === "image/png" ? "png" : contentType === "image/gif" ? "gif" : contentType === "image/webp" ? "webp" : "jpg";
      const path = `${userId}/${stamp}-${i}.${ext}`;
      const res = await withTimeout(bucket.upload(path, body, { contentType }), uploadTimeout(body.size, baseTimeoutMs));
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
