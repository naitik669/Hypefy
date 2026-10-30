import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { Track } from "@/lib/music";
import { extractMentions } from "@/lib/content-utils";
import { layerMentions, type ShowLayer } from "@/lib/show-layers";
import type { ShowAudience } from "@/lib/show-audience";
import { isVideoFile, uploadContentType } from "@/lib/video-mime";

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
  hiddenFrom: string[];
  collabId?: string;
};

export type ShowPublishResult =
  | { ok: true; id: string }
  | { ok: false; reason: "upload" | "insert" | "hidden" };

export async function publishShow(
  supabase: SupabaseClient<Database>,
  d: ShowDraft,
  /** Told apart so two Shows from one album, in the same millisecond, get two files. */
  index = 0,
): Promise<ShowPublishResult> {
  const bucket = "show-media";
  const ext = d.file.name.split(".").pop() || (isVideoFile(d.file) ? "webm" : "jpg");
  const path = `${d.userId}/${Date.now()}${index ? `-${index}` : ""}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(bucket)
    // The base type, so the object is served as video/webm rather than
    // video/webm;codecs=vp9,opus.
    .upload(path, d.file, { contentType: uploadContentType(d.file), upsert: false });
  if (upErr) return { ok: false, reason: "upload" };

  const mediaUrl = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  const text = d.caption.trim();

  const { data: row, error: insErr } = await supabase
    .from("shows")
    .insert({
      user_id: d.userId,
      media_url: mediaUrl,
      caption: text || null,
      track: (d.track ?? null) as unknown as Json,
      // A name typed into the caption and one placed on the picture both
      // reach their owner; layerMentions says why.
      mentions: [...new Set([...extractMentions(text), ...layerMentions(d.layers)])],
      layers: d.layers as unknown as Json,
      audience: d.audience,
      collab_id: d.collabId ?? null,
    })
    .select("id")
    .single();

  if (insErr || !row) {
    // The file went up first; with no Show pointing at it, it is litter.
    await supabase.storage.from(bucket).remove([path]);
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
      return { ok: false, reason: "hidden" };
    }
  }

  return { ok: true, id: row.id };
}

/** What to tell someone when a Show did not go up. */
export function publishFailureMessage(reason: "upload" | "insert" | "hidden"): string {
  if (reason === "upload") return "Upload failed. Check your connection and try again.";
  if (reason === "hidden") return "Couldn't set who it's hidden from. Nothing was posted.";
  return "Couldn't publish that. Try again.";
}
