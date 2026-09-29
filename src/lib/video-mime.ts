/**
 * What kind of video a file actually is, in the form storage will accept.
 *
 * MediaRecorder is asked for "video/webm;codecs=vp9,opus" and hands back a
 * blob whose type is that whole string, parameters and all. Every check in
 * the app compared it to a bare list with `includes`, so a Shot recorded in
 * the app was refused before it ever left the phone: "That video format
 * isn't supported."
 *
 * The bucket is not part of this, though its allowed_mime_types is bare too.
 * Voice notes have always uploaded as "audio/webm;codecs=opus" against a
 * bare "audio/webm" and work, so Supabase evidently compares the base type.
 * Sending the base type anyway is still right — it is what ends up on the
 * stored object's content-type header when the file is served back.
 *
 * A MIME type is a base type plus optional parameters (RFC 2045). Only the
 * base is the format; the parameters describe how it is encoded. So the
 * comparison has to be on the base, and so does the contentType we upload.
 */

/** Mirrors the shot-media and show-media buckets' allowed_mime_types. */
export const ALLOWED_VIDEO_MIME = ["video/mp4", "video/webm", "video/quicktime"] as const;

/** Extensions worth trusting when a picker hands over no type at all. */
const BY_EXTENSION: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  qt: "video/quicktime",
};

/**
 * The base type, without parameters.
 *
 * "video/webm;codecs=vp9,opus" → "video/webm". Case and stray spaces are
 * normalised too: MIME types are case-insensitive, and a value that arrives
 * as "Video/MP4 " should not be a different format.
 */
export function baseMime(type: string | null | undefined): string {
  if (!type) return "";
  return type.split(";")[0].trim().toLowerCase();
}

/**
 * The video type of a file, falling back to its extension.
 *
 * Some Android galleries hand over a File with an empty type. Guessing from
 * the extension is better than treating it as "not a video", which is what
 * an empty string did — it slipped past the format check entirely and then
 * uploaded with no content type at all.
 */
export function videoMimeOf(file: { type?: string; name?: string }): string {
  const base = baseMime(file.type);
  if (base) return base;
  const ext = (file.name ?? "").split(".").pop()?.toLowerCase() ?? "";
  return BY_EXTENSION[ext] ?? "";
}

/** Is this a video at all, however it described itself? */
export function isVideoFile(file: { type?: string; name?: string }): boolean {
  return videoMimeOf(file).startsWith("video/");
}

/** Will the bucket take it? */
export function isAllowedVideo(file: { type?: string; name?: string }): boolean {
  return (ALLOWED_VIDEO_MIME as readonly string[]).includes(videoMimeOf(file));
}

/**
 * What to hand Supabase as contentType.
 *
 * Not the raw file.type. The parameters describe how the bytes were
 * produced, not what they are, and this value becomes the content-type
 * header the object is served with.
 */
export function uploadContentType(file: { type?: string; name?: string }, fallback = "video/webm"): string {
  return videoMimeOf(file) || baseMime(file.type) || fallback;
}
