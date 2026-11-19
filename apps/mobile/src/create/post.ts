import { extractHashtags, extractMentions } from "@hypefy/core/content-utils";
import { coverOf, imageUrlsOf, type PostSlot } from "@hypefy/core/post-media";

/**
 * Posting a photo from the phone.
 *
 * The row this writes has to be readable by every client, including ones
 * that predate the `media` column — so the shape comes from
 * @hypefy/core/post-media rather than being assembled here:
 *
 *  - `image_urls` is the photos in order, for readers older than `media`.
 *  - `image_url` is the COVER, which `coverOf` decides. Not simply
 *    `urls[0]`: a post opening with a clip would otherwise have no
 *    thumbnail anywhere a grid or a share card looks.
 *  - `media` is the truth about what the post carries, and is null rather
 *    than `[]` for a text-only post — nothing to describe.
 *  - `image_urls` is a NOT NULL column with a `[]` default, so sending
 *    null breaks a text-only post.
 *
 * Hashtags and mentions are extracted by core's own functions, so a
 * caption typed on a phone is indexed exactly as one typed on the web.
 *
 * **What the web's uploader does and this does not:**
 *
 *  - **Shrinking before upload.** The web fits a photo inside an edge
 *    limit, which turns a 3-6MB camera frame into about a megabyte.
 *    There is no canvas here, and doing it properly wants an image
 *    library. The capture is taken at a reduced quality instead, which
 *    is a smaller lever on the same problem and is stated as such.
 *  - **Several photos, video, alt text, polls, scheduling, drafts.**
 *  - **The background upload queue**, which is the thing a WebView could
 *    never do and a native app can — but it is its own piece of work.
 */

/** The bucket the web writes photos to. */
export const PHOTO_BUCKET = "post-images";

/**
 * Where one photo goes.
 *
 * Under the author's own id, which is what the storage policy keys on —
 * a path that does not start with the uploader's id is refused, and the
 * refusal reads as a generic upload failure.
 */
export function photoPath(userId: string, at: number, ext = "jpg"): string {
  return `${userId}/${at}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
}

export type NewPost = {
  user_id: string;
  caption: string;
  body: null;
  image_url: string | null;
  image_urls: string[];
  media: PostSlot[] | null;
  hashtags: string[];
  mentions: string[];
};

/**
 * The row, built from the caption and whatever was uploaded.
 *
 * Pure, and exported, so a test can check the shape without a network —
 * the shape is the part another client depends on, and it is the part
 * that is silently wrong if `media` is `[]` or `image_urls` is null.
 */
export function newPost(args: {
  userId: string;
  caption: string;
  urls: string[];
}): NewPost {
  const slots: PostSlot[] = args.urls.map((url) => ({ kind: "image", url, alt: null }));
  const caption = args.caption.trim();
  return {
    user_id: args.userId,
    caption,
    // The web keeps `body` for its rich composer; a phone capture has a
    // caption and nothing else, and null is what "no body" means here.
    body: null,
    image_url: coverOf(slots),
    image_urls: imageUrlsOf(slots),
    media: slots.length ? slots : null,
    hashtags: extractHashtags(caption),
    mentions: extractMentions(caption),
  };
}

type Storage = {
  from(bucket: string): {
    upload(
      path: string,
      file: unknown,
      options?: { contentType?: string; upsert?: boolean },
    ): PromiseLike<{ error: unknown }>;
    getPublicUrl(path: string): { data: { publicUrl: string } };
  };
};

type Queryable = {
  storage: Storage;
  from(table: string): { insert(row: NewPost): PromiseLike<{ error: unknown }> };
};

function messageOf(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return fallback;
}

/**
 * Uploads one photo and returns its public URL.
 *
 * The file is passed as whatever the platform gives — on a phone that is
 * an ArrayBuffer read from the capture's uri, because supabase-js cannot
 * take a React Native file object and silently uploads zero bytes if you
 * hand it one. That failure is invisible: the upload "succeeds" and the
 * post appears with a broken picture.
 */
export async function uploadPhoto(
  supabase: Queryable,
  args: { userId: string; file: ArrayBuffer; contentType: string; ext: string },
): Promise<{ url: string } | { error: string }> {
  const path = photoPath(args.userId, Date.now(), args.ext);
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, args.file, { contentType: args.contentType, upsert: false });
  if (error) return { error: messageOf(error, "Could not upload that photo.") };
  return { url: supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl };
}

/** Writes the row. */
export async function createPost(
  supabase: Queryable,
  row: NewPost,
): Promise<{ ok: true } | { error: string }> {
  const { error } = await supabase.from("posts").insert(row);
  if (error) return { error: messageOf(error, "Could not post that.") };
  return { ok: true };
}
