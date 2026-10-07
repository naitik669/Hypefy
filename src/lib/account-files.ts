import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Removing a person's files when their account is deleted.
 *
 * Deleting the auth user takes every row with it, through the foreign keys.
 * It takes none of the files: photos, videos, voice notes and chat media sat
 * in Storage with nothing pointing at them. Postgres cannot delete a Storage
 * object, so the route does it here, with the service-role client, before the
 * account goes.
 */

/** How many paths one remove call is given. */
export const REMOVE_BATCH = 100;
/** Each pass lists what is left. This many passes is far more than any account needs. */
export const MAX_PASSES = 50;

export type FileRow = { bucket_id: string; name: string };

/** Paths by bucket, each bucket's list cut into batches. */
export function batchesByBucket(rows: FileRow[], size = REMOVE_BATCH): { bucket: string; paths: string[] }[] {
  const byBucket = new Map<string, string[]>();
  for (const row of rows) {
    if (!row?.bucket_id || !row?.name) continue;
    byBucket.set(row.bucket_id, [...(byBucket.get(row.bucket_id) ?? []), row.name]);
  }
  const out: { bucket: string; paths: string[] }[] = [];
  for (const [bucket, paths] of byBucket) {
    for (let i = 0; i < paths.length; i += size) out.push({ bucket, paths: paths.slice(i, i + size) });
  }
  return out;
}

export type RemoveResult = { ok: true; removed: number } | { ok: false; removed: number; error: string };

/**
 * Remove every file the person owns, in every bucket.
 *
 * Asks what is left, removes it, and asks again, until nothing is: one
 * answer is capped at a thousand rows, and an account can have more. Stops
 * at the first failure and says so, so the caller can leave the account in
 * place and let the person try again.
 */
export async function removeFilesOf(admin: SupabaseClient, userId: string): Promise<RemoveResult> {
  let removed = 0;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const { data, error } = await admin.rpc("storage_paths_of", { p_user: userId });
    if (error) return { ok: false, removed, error: error.message };
    const rows = (data ?? []) as FileRow[];
    if (rows.length === 0) return { ok: true, removed };

    for (const { bucket, paths } of batchesByBucket(rows)) {
      const { error: removeError } = await admin.storage.from(bucket).remove(paths);
      if (removeError) return { ok: false, removed, error: `${bucket}: ${removeError.message}` };
      removed += paths.length;
    }
  }
  return { ok: false, removed, error: "files were still listed after every pass" };
}
