/**
 * Reading, saving and sending stickers (0220).
 *
 * Every function takes the Supabase client as an argument, so the tests
 * drive these with a fake and see what is asked of the database — and
 * every one of them hands its error back. "You have no stickers" and "the
 * read was refused" must never look the same (the Shots outage, 26 Nov).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  STICKER_BUCKET,
  STICKER_MAX_BYTES,
  readSticker,
  readStickerRow,
  recentStickers,
  type Sticker,
  type StickerEdge,
} from "@hypefy/core/stickers";
import { randomObjectName } from "@hypefy/core/object-name";

type Client = SupabaseClient<Database>;

export type StickerResult<T> = { ok: true; value: T } | { ok: false; error: string };

const COLUMNS = "id, path, edge, width, height";

/** Your own stickers, newest first. */
export async function listMyStickers(
  supabase: Client,
  userId: string,
): Promise<StickerResult<Sticker[]>> {
  const { data, error } = await supabase
    .from("stickers")
    .select(COLUMNS)
    .eq("owner_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return { ok: false, error: error.message };
  return { ok: true, value: (data ?? []).map(readStickerRow).filter((s): s is Sticker => s !== null) };
}

/** Stickers you sent lately, newest first, each once. */
export async function listRecentStickers(
  supabase: Client,
  userId: string,
): Promise<StickerResult<Sticker[]>> {
  const { data, error } = await supabase
    .from("messages")
    .select("kind, is_unsent, metadata")
    .eq("sender_id", userId)
    .eq("kind", "sticker")
    .eq("is_unsent", false)
    .order("created_at", { ascending: false })
    .limit(120);
  if (error) return { ok: false, error: error.message };
  return { ok: true, value: recentStickers(data ?? []) };
}

/**
 * Keep a picture as one of your stickers.
 *
 * The file first, then the row that says it is a sticker. If the row is
 * refused the file is taken back out, so a failed save leaves nothing
 * behind in a public bucket.
 */
export async function saveSticker(
  supabase: Client,
  userId: string,
  image: Blob,
  edge: StickerEdge,
  size: { width: number; height: number },
): Promise<StickerResult<Sticker>> {
  const ext = image.type === "image/webp" ? "webp" : image.type === "image/png" ? "png" : null;
  if (!ext) return { ok: false, error: "A sticker has to be a PNG or WebP." };
  if (image.size > STICKER_MAX_BYTES) return { ok: false, error: "That sticker is too big." };

  const path = randomObjectName(userId, ext);
  const up = await supabase.storage
    .from(STICKER_BUCKET)
    .upload(path, image, { contentType: image.type, upsert: false, cacheControl: "31536000" });
  if (up.error) return { ok: false, error: up.error.message };

  const { data, error } = await supabase
    .from("stickers")
    .insert({ owner_id: userId, path, edge, width: size.width, height: size.height })
    .select(COLUMNS)
    .single();
  const sticker = error ? null : readStickerRow(data);
  if (!sticker) {
    await supabase.storage.from(STICKER_BUCKET).remove([path]);
    return { ok: false, error: error?.message ?? "Couldn't save that sticker." };
  }
  return { ok: true, value: sticker };
}

/** Put a sticker in a conversation. The server copies the rest from the row. */
export async function sendSticker(
  supabase: Client,
  conversationId: string,
  stickerId: string,
  opts: { replyToId?: string | null; forwarded?: boolean } = {},
): Promise<StickerResult<unknown>> {
  const { data, error } = await supabase.rpc("send_sticker", {
    p_conversation_id: conversationId,
    p_sticker_id: stickerId,
    p_reply_to_id: opts.replyToId ?? undefined,
    p_forwarded: opts.forwarded ?? false,
  });
  if (error || !data) return { ok: false, error: error?.message ?? "Couldn't send that sticker." };
  return { ok: true, value: data };
}

/**
 * Forward a sticker message: it goes again as the same sticker, marked as
 * forwarded. There is no body to copy — send_message would refuse it as
 * empty — so the forward sheet hands sticker messages here instead.
 */
export async function forwardSticker(
  supabase: Client,
  conversationId: string,
  message: { kind: string; is_unsent?: boolean; metadata?: unknown },
): Promise<StickerResult<unknown>> {
  const sticker = readSticker(message);
  if (!sticker) return { ok: false, error: "That sticker can't be forwarded." };
  return sendSticker(supabase, conversationId, sticker.id, { forwarded: true });
}
