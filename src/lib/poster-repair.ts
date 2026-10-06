import { capturePoster } from "@/lib/video-poster";

/**
 * Give a Shot that has no cover a cover.
 *
 * Shots posted before covers were captured reliably have none, and show as a
 * black tile wherever a still is drawn. Only the Shot's owner may change it,
 * so this cannot be fixed from outside: it runs on the owner's own device,
 * the next time they look at their Shots. It takes a frame from the video,
 * stores it beside the video, and sets it as the cover.
 *
 * Once per Shot per session, however it turns out, so a video that cannot be
 * decoded is not downloaded again on every visit to the profile.
 */

type Db = {
  storage: {
    from: (bucket: string) => {
      upload: (path: string, body: Blob, opts: { contentType: string }) => PromiseLike<{ error: unknown }>;
      getPublicUrl: (path: string) => { data: { publicUrl: string } };
    };
  };
  from: (table: string) => {
    update: (row: { poster_url: string }) => {
      eq: (col: string, v: string) => {
        is: (col: string, v: null) => PromiseLike<{ error: unknown }>;
      };
    };
  };
};

export type RepairableShot = { id: string; user_id: string; media_url: string; poster_url: string | null };

const tried = new Set<string>();

/** For tests: forget which Shots have been tried. */
export function forgetRepairs() {
  tried.clear();
}

/**
 * Returns the new cover's address, or null if there was nothing to do or it
 * could not be done. Never throws: a missing cover is not worth an error.
 */
export async function repairPoster(
  db: Db,
  shot: RepairableShot,
  viewerId: string | null | undefined,
  capture: (src: string) => Promise<Blob | null> = capturePoster,
): Promise<string | null> {
  // Only the owner's device, only a Shot with no cover, only once.
  if (!viewerId || viewerId !== shot.user_id || shot.poster_url || tried.has(shot.id)) return null;
  tried.add(shot.id);
  try {
    const frame = await capture(shot.media_url);
    if (!frame) return null;
    // Named for the Shot, in the owner's own folder, beside the video.
    const path = `${shot.user_id}/${shot.id}-poster-${Date.now()}.jpg`;
    const { error: upErr } = await db.storage.from("shot-media").upload(path, frame, { contentType: "image/jpeg" });
    if (upErr) return null;
    const url = db.storage.from("shot-media").getPublicUrl(path).data.publicUrl;
    // Only where there is still none: never replace a cover someone chose.
    const { error } = await db.from("shots").update({ poster_url: url }).eq("id", shot.id).is("poster_url", null);
    return error ? null : url;
  } catch {
    return null;
  }
}
