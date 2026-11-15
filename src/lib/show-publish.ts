import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { Track } from "@/lib/music";
import { extractMentions } from "@/lib/content-utils";
import { layerMentions, type AddYoursPayload, type ShowLayer } from "@/lib/show-layers";
import { readLifetime, type ShowAudience, type ShowLifetime } from "@/lib/show-audience";
import { isVideoFile, uploadContentType } from "@/lib/video-mime";
import { capturePoster } from "@/lib/video-poster";
import { hashImageFile } from "@/lib/media-hash-client";

/**
 * Putting one Show up: the file into show-media, then the row, then who it
 * is kept from.
 *
 * Shared by the single-Show preview and the album, so an album of five is
 * five of exactly this and cannot drift from it. Each step that fails takes
 * the earlier ones back down: no file without a row, and no row standing in
 * front of someone it was meant to be hidden from.
 */
export type ShowDraft = {
  userId: string;
  file: File;
  caption: string;
  track: Track | null;
  layers: ShowLayer[];
  audience: ShowAudience;
  /** How long it stays up. Defaults to the short one. See 0212. */
  lifetimeHours?: ShowLifetime;
  hiddenFrom: string[];
  collabId?: string;
};

export type ShowPublishResult =
  | { ok: true; id: string }
  | { ok: false; reason: "upload" | "insert" | "hidden" | "prompt" | "blocked" };

export async function publishShow(
  supabase: SupabaseClient<Database>,
  d: ShowDraft,
  /** Told apart so two Shows from one album, in the same millisecond, get two files. */
  index = 0,
): Promise<ShowPublishResult> {
  const bucket = "show-media";
  const ext = d.file.name.split(".").pop() || (isVideoFile(d.file) ? "webm" : "jpg");
  const path = `${d.userId}/${Date.now()}${index ? `-${index}` : ""}.${ext}`;

  /*
   * A still for a video Show.
   *
   * Without one, every place a Show is drawn small — a collab grid, a
   * showcase, a reply card — has to mount a live <video> with BLANK_POSTER
   * and wait for the decoder. A grid of eight is eight decoders running to
   * display eight still pictures.
   *
   * Captured before anything is stored. 0213 put this after the upload so
   * that a failure cost nothing, which the catch below already guarantees
   * on its own — and the Shot path has always captured first, for a reason
   * that applies here just as much: a backgrounded WebView does not
   * decode, and putting the phone down during the upload is exactly what
   * people do. Going first also means the blocklist check below can refuse
   * a clip in a second rather than after a minute on a phone uplink.
   */
  let poster: Blob | null = null;
  if (isVideoFile(d.file)) {
    const localUrl = URL.createObjectURL(d.file);
    try {
      poster = await capturePoster(localUrl, null);
    } catch {
      /* no poster is a Show that behaves as every Show did before 0213 */
    } finally {
      URL.revokeObjectURL(localUrl);
    }
  }

  /*
   * The blocklist check, which the Show path never ran (0214).
   *
   * 0157 wired the perceptual-hash blocklist to posts, shots, comments and
   * messages, and every other link in the chain already handled Shows —
   * reports accept them, admin_remove_content removes them. Only these two
   * calls were missing, so a picture a moderator took down could go
   * straight back up as a Show and nothing looked.
   *
   * A photo Show is hashed as itself; a video one by its poster, which is a
   * real frame and the image people see in a grid. Hashing a whole clip is
   * video fingerprinting, a different problem, and is not pretended at.
   *
   * A null hash is not a refusal. It means "we do not know" — an undecodable
   * file, a clip with no poster — and the post path settled long ago that
   * this reads as let it through: refusing an upload over a decoder quirk is
   * a far worse outcome than a miss.
   */
  const fingerprintOf = isVideoFile(d.file) ? poster : d.file;
  const hash = fingerprintOf ? await hashImageFile(fingerprintOf) : null;
  if (hash) {
    const { data: blocked } = await supabase.rpc("check_media", { p_hash: hash });
    if (blocked) return { ok: false, reason: "blocked" };
  }

  const { error: upErr } = await supabase.storage
    .from(bucket)
    // The base type, so the object is served as video/webm rather than
    // video/webm;codecs=vp9,opus.
    .upload(path, d.file, { contentType: uploadContentType(d.file), upsert: false });
  if (upErr) return { ok: false, reason: "upload" };

  const mediaUrl = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;

  // The poster, best effort: a Show with none still plays and still draws,
  // so a failure here must not cost an upload that has already succeeded.
  let posterUrl: string | null = null;
  if (poster) {
    const posterPath = `${d.userId}/${Date.now()}${index ? `-${index}` : ""}-poster.jpg`;
    const { error: pErr } = await supabase.storage
      .from(bucket)
      .upload(posterPath, poster, { contentType: "image/jpeg", upsert: false });
    if (!pErr) {
      posterUrl = supabase.storage.from(bucket).getPublicUrl(posterPath).data.publicUrl;
    }
  }

  const text = d.caption.trim();

  // An Add yours prompt needs somewhere for the answers to go: a shared
  // Show of the author's, named after the prompt, made now rather than
  // when the sticker was placed so a Show that is never posted leaves none
  // behind. join_add_yours lets viewers in only if it is the author's.
  const made: string[] = [];
  const layers: ShowLayer[] = [];
  for (const layer of d.layers) {
    if (layer.type !== "addyours" || (layer.payload as AddYoursPayload).collabId) {
      layers.push(layer);
      continue;
    }
    const prompt = (layer.payload as AddYoursPayload).prompt;
    const { data: collabId, error } = await supabase.rpc("create_show_collab", { p_title: prompt });
    if (error || !collabId) {
      await undoCollabs(supabase, made);
      await supabase.storage.from(bucket).remove([path]);
      return { ok: false, reason: "prompt" };
    }
    made.push(collabId);
    layers.push({ ...layer, payload: { prompt, collabId } });
  }

  const { data: row, error: insErr } = await supabase
    .from("shows")
    .insert({
      user_id: d.userId,
      media_url: mediaUrl,
      poster_url: posterUrl,
      caption: text || null,
      track: (d.track ?? null) as unknown as Json,
      // A name typed into the caption and one placed on the picture both
      // reach their owner; layerMentions says why.
      mentions: [...new Set([...extractMentions(text), ...layerMentions(layers)])],
      layers: layers as unknown as Json,
      audience: d.audience,
      // Hours, not a timestamp: the trigger computes expires_at, because a
      // timestamp from a browser is one a browser can be wrong about.
      lifetime_hours: readLifetime(d.lifetimeHours),
      collab_id: d.collabId ?? null,
    })
    .select("id")
    .single();

  if (insErr || !row) {
    // The file went up first; with no Show pointing at it, it is litter.
    await supabase.storage.from(bucket).remove([path]);
    await undoCollabs(supabase, made);
    // Said out loud: a toast was all anyone saw while 0183's policy refused
    // every Show, and it named nothing.
    console.error("show insert failed", insErr);
    return { ok: false, reason: "insert" };
  }

  // The exclusions, once there is a Show for them to point at. A row here is
  // a promise, so a failure to write them is a failure to publish.
  if (d.hiddenFrom.length > 0) {
    const { error: hideErr } = await supabase
      .from("show_hidden_from")
      .insert(d.hiddenFrom.map((id) => ({ show_id: row.id, user_id: id })));
    if (hideErr) {
      await supabase.from("shows").delete().eq("id", row.id);
      await supabase.storage.from(bucket).remove([path]);
      await undoCollabs(supabase, made);
      return { ok: false, reason: "hidden" };
    }
  }

  /*
   * The other half of 0214: record what was posted, against the Show it was
   * posted to, so that taking this Show down puts its hash on the blocklist
   * and it cannot come back as anything else.
   *
   * Never allowed to fail the publish. The Show is live by the time this
   * runs; a fingerprint that does not write means a weaker blocklist later,
   * which is not worth showing anybody an error over — the same bargain
   * recordFingerprints makes on the post path.
   *
   * Keyed to the poster's URL for a video Show, because that is the object
   * the hash actually describes.
   */
  if (hash) {
    try {
      await supabase.rpc("claim_media", {
        p_target_type: "show",
        p_target_id: row.id,
        p_url: posterUrl ?? mediaUrl,
        p_hash: hash,
      });
    } catch {
      /* a weaker blocklist, not a failed post */
    }
  }

  return { ok: true, id: row.id };
}

/** Shared Shows made for prompts on a Show that then did not go up: closed again. */
async function undoCollabs(supabase: SupabaseClient<Database>, ids: string[]) {
  for (const id of ids) await supabase.rpc("leave_show_collab", { p_collab: id });
}

/** What to tell someone when a Show did not go up. */
export function publishFailureMessage(
  reason: "upload" | "insert" | "hidden" | "prompt" | "blocked",
): string {
  // Deliberately not "this matches something we removed". Describing the
  // rule is how somebody works out what to change to get round it — the
  // same wording the post path uses.
  if (reason === "blocked") return "That can't be posted.";
  if (reason === "upload") return "Upload failed. Check your connection and try again.";
  if (reason === "prompt") return "Couldn't set up the Add yours prompt. Nothing was posted.";
  if (reason === "hidden") return "Couldn't set who it's hidden from. Nothing was posted.";
  return "Couldn't publish that. Try again.";
}
