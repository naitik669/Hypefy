/**
 * Making, changing and reading sticker packs (0224).
 *
 * Every call goes through a database function that checks who is asking;
 * none of the pack tables can be read or written directly. Each one takes
 * the client as an argument so the tests drive it with a fake, and each
 * hands its error back: "you have no packs" and "the read was refused" must
 * never look the same.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { readPack, readPacks, type PackAudience, type StickerPack } from "@hypefy/core/sticker-packs";
import { recentStickers, type Sticker } from "@hypefy/core/stickers";
import type { StickerResult } from "@/lib/sticker-store";

type Client = SupabaseClient<Database>;

/** One pack back from the server, or a failure — never a silent null. */
function onePack(data: unknown, error: { message: string } | null): StickerResult<StickerPack> {
  if (error) return { ok: false, error: error.message };
  const pack = readPack(data);
  return pack ? { ok: true, value: pack } : { ok: false, error: "That pack couldn't be read." };
}

/** Your rail: the packs you made, then the ones you added. */
export async function listMyPacks(supabase: Client): Promise<StickerResult<StickerPack[]>> {
  const { data, error } = await supabase.rpc("my_sticker_packs");
  if (error) return { ok: false, error: error.message };
  return { ok: true, value: readPacks(data) };
}

/**
 * Stickers people sent you, newest first, each once — half of the picker's
 * Saved source (the other half is your favourites). Read from the messages
 * you can already see, so it reaches nothing new.
 */
export async function listReceivedStickers(
  supabase: Client,
  userId: string,
): Promise<StickerResult<Sticker[]>> {
  const { data, error } = await supabase
    .from("messages")
    .select("kind, is_unsent, metadata")
    .eq("kind", "sticker")
    .neq("sender_id", userId)
    .eq("is_unsent", false)
    .is("removed_at", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return { ok: false, error: error.message };
  return { ok: true, value: recentStickers(data ?? [], 120) };
}

export async function createPack(
  supabase: Client,
  input: { name: string; audience: PackAudience; stickerIds: string[]; coverStickerId: string | null },
): Promise<StickerResult<StickerPack>> {
  const { data, error } = await supabase.rpc("create_sticker_pack", {
    p_name: input.name,
    p_audience: input.audience,
    p_sticker_ids: input.stickerIds,
    p_cover_sticker_id: input.coverStickerId ?? undefined,
  });
  return onePack(data, error);
}

export async function renamePack(supabase: Client, packId: string, name: string): Promise<StickerResult<StickerPack>> {
  const { data, error } = await supabase.rpc("rename_sticker_pack", { p_pack_id: packId, p_name: name });
  return onePack(data, error);
}

/** Takes it out of everyone's rail. Its stickers stay. */
export async function deletePack(supabase: Client, packId: string): Promise<StickerResult<null>> {
  const { error } = await supabase.rpc("delete_sticker_pack", { p_pack_id: packId });
  return error ? { ok: false, error: error.message } : { ok: true, value: null };
}

export async function addToPack(supabase: Client, packId: string, stickerIds: string[]): Promise<StickerResult<StickerPack>> {
  const { data, error } = await supabase.rpc("add_stickers_to_pack", { p_pack_id: packId, p_sticker_ids: stickerIds });
  return onePack(data, error);
}

/** Never deletes the sticker: only this pack stops holding it. */
export async function removeFromPack(supabase: Client, packId: string, stickerId: string): Promise<StickerResult<StickerPack>> {
  const { data, error } = await supabase.rpc("remove_sticker_from_pack", { p_pack_id: packId, p_sticker_id: stickerId });
  return onePack(data, error);
}

/** Someone else's pack off your rail. */
export async function unsavePack(supabase: Client, packId: string): Promise<StickerResult<null>> {
  const { error } = await supabase.rpc("unsave_sticker_pack", { p_pack_id: packId });
  return error ? { ok: false, error: error.message } : { ok: true, value: null };
}

/** Opening an added pack clears its dot. Best effort: a dot left on is harmless. */
export async function markPackSeen(supabase: Client, packId: string): Promise<void> {
  await supabase.rpc("mark_sticker_pack_seen", { p_pack_id: packId });
}
