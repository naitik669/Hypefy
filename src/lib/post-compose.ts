/**
 * The small decisions the post composer makes, kept where they can be tested
 * without drawing the composer.
 */

/** What a post may carry, as the post-images bucket allows it. */
export const POST_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

const BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/**
 * The image type of a picked file, falling back to its extension.
 *
 * Some Android galleries hand over a File with an empty type. The composer
 * compared that empty string to the allowed list, so a perfectly good JPEG
 * was turned away as "Only JPEG, PNG, and WebP images are allowed."
 */
export function imageTypeOf(file: { type?: string; name?: string }): string {
  const stated = (file.type ?? "").split(";")[0].trim().toLowerCase();
  if (stated) return stated;
  const ext = (file.name ?? "").split(".").pop()?.toLowerCase() ?? "";
  return BY_EXTENSION[ext] ?? "";
}

export function isAllowedPostImage(file: { type?: string; name?: string }): boolean {
  return (POST_IMAGE_TYPES as readonly string[]).includes(imageTypeOf(file));
}

/**
 * How a photo is stored: its extension and the type it is served with.
 *
 * Every photo used to go up as "<n>.jpg" with content-type image/jpeg. That
 * is true of a cropped photo, which is re-encoded as JPEG. It is not true of
 * one posted in Auto, which is sent exactly as it was picked: a PNG or WebP
 * was stored under a JPEG's name and served as one.
 */
export function postImageUpload(file: { type?: string; name?: string }): { ext: string; contentType: string } {
  const type = imageTypeOf(file);
  if (type === "image/png") return { ext: "png", contentType: type };
  if (type === "image/webp") return { ext: "webp", contentType: type };
  return { ext: "jpg", contentType: "image/jpeg" };
}

/**
 * Where a draft is kept, per account.
 *
 * It was one key for the whole device, so on a phone with two accounts the
 * words half-written on one appeared in the other's composer, ready to post.
 */
export const LEGACY_POST_DRAFT_KEY = "hypefy_post_draft";
export function postDraftKey(userId: string): string {
  return `${LEGACY_POST_DRAFT_KEY}:${userId}`;
}

/** A schedule needs this much room, or it is not really "later". */
const SCHEDULE_MARGIN_MS = 30_000;

/**
 * What a chosen time means at the moment Post is pressed.
 *
 *   none    nothing was chosen: post now
 *   ok      still ahead: schedule it
 *   passed  it was chosen and has since gone by
 *
 * "passed" used to be folded into "none": someone who set a time and then
 * took a while over the caption had the post go out immediately, under a
 * chip that still showed the time they had picked.
 */
export function scheduleState(scheduleAt: string | null, now = Date.now()): "none" | "ok" | "passed" {
  if (!scheduleAt) return "none";
  const at = new Date(scheduleAt).getTime();
  if (Number.isNaN(at)) return "passed";
  return at > now + SCHEDULE_MARGIN_MS ? "ok" : "passed";
}
