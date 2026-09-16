"use client";

import { createClient } from "@/lib/supabase/client";

/**
 * A picture on its way into a comment.
 *
 * Shrunk in the browser before it goes anywhere. A comment photo is read at
 * about 240px wide in a thread and full-screen at most, so a 12MP original is
 * ten seconds of someone's data spent on pixels nobody will see — and the
 * bucket refuses anything over 5MB, which is exactly the phone photo people
 * would try to send first.
 */
export const COMMENT_PHOTO_MAX_EDGE = 1440;
const QUALITY = 0.85;
/** What the bucket accepts. Anything else is rejected before the upload. */
const TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export function isCommentPhotoType(type: string): boolean {
  return TYPES.includes(type);
}

/** The size that fits inside the cap without changing the shape. */
export function fitWithin(
  w: number,
  h: number,
  max = COMMENT_PHOTO_MAX_EDGE,
): { w: number; h: number } {
  const long = Math.max(w, h);
  if (long <= max) return { w, h };
  const k = max / long;
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

/**
 * Shrink to the cap, as a JPEG.
 *
 * A GIF is passed through untouched: drawing one to a canvas keeps the first
 * frame and throws the animation away, which is the whole point of sending it.
 * Anything that fails to decode is passed through too — the upload will say
 * what is wrong with it better than a silent failure here.
 */
export async function shrinkForComment(file: File): Promise<Blob> {
  if (file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const out = fitWithin(bitmap.width, bitmap.height);
    if (out.w === bitmap.width && out.h === bitmap.height && file.size < 800_000) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = out.w;
    canvas.height = out.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, out.w, out.h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY),
    );
    return blob ?? file;
  } catch {
    return file;
  }
}

/**
 * Put it in the bucket and hand back its public URL.
 *
 * The user's own folder, because that is what the storage policy allows —
 * and what create_comment checks the URL against before it will store it on
 * a row.
 */
export async function uploadCommentPhoto(
  file: File,
  userId: string,
): Promise<string | null> {
  if (!isCommentPhotoType(file.type)) return null;
  const supabase = createClient();
  const blob = await shrinkForComment(file);
  const ext = blob.type === "image/gif" ? "gif" : blob.type === "image/png" ? "png" : "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("comment-images")
    .upload(path, blob, { contentType: blob.type, upsert: false });
  if (error) return null;
  return supabase.storage.from("comment-images").getPublicUrl(path).data.publicUrl;
}
