"use client";

import type { createClient } from "@/lib/supabase/client";
import { toFolder, type Folder } from "@/lib/folders";
import type { SavedTarget } from "@/components/saved/FolderSheet";

type Client = ReturnType<typeof createClient>;

/**
 * Your folders, kept for the session so the fan can open the instant a hold
 * lands rather than after a round trip. Anything that changes them — filing
 * into one, making one — updates or drops this copy.
 */
let cached: { userId: string; folders: Folder[] } | null = null;

export async function loadFolders(supabase: Client, userId: string): Promise<Folder[]> {
  if (cached?.userId === userId) return cached.folders;
  const { data, error } = await supabase.rpc("get_folders");
  if (error) return cached?.userId === userId ? cached.folders : [];
  const folders = (data ?? []).map(toFolder);
  cached = { userId, folders };
  return folders;
}

/** The copy is stale — a folder was made or renamed somewhere. Next load reads fresh. */
export function forgetFolders() {
  cached = null;
}

/** Keep the cached counts in step with a filing change, without a reload. */
export function bumpFolderCounts(userId: string, added: Set<string>, removed: Set<string>) {
  if (cached?.userId !== userId) return;
  cached = {
    userId,
    folders: cached.folders.map((f) =>
      added.has(f.id)
        ? { ...f, itemCount: f.itemCount + 1 }
        : removed.has(f.id)
          ? { ...f, itemCount: Math.max(0, f.itemCount - 1) }
          : f
    ),
  };
}

/** Which of your folders this post or Shot is in. */
export async function loadInside(supabase: Client, target: SavedTarget): Promise<Set<string>> {
  const q = supabase.from("collection_items").select("collection_id");
  const { data } = await (target.post ? q.eq("post_id", target.post) : q.eq("shot_id", target.shot!));
  return new Set((data ?? []).map((r) => r.collection_id));
}

/**
 * File it in exactly `next`. Filing saves it too (a trigger does that), so a
 * caller can mark it saved once this succeeds.
 */
export async function fileInto(supabase: Client, target: SavedTarget, next: Set<string>): Promise<boolean> {
  const { error } = await supabase.rpc("set_item_folders", {
    ...(target.post ? { p_post: target.post } : { p_shot: target.shot! }),
    p_folders: [...next],
  });
  return !error;
}
