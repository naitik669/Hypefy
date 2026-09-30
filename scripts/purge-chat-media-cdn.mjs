/**
 * Force the CDN to forget the old public copies of chat media.
 *
 * Migration 0105 made chat-media and voice-notes private. The origin honours
 * that immediately — but Supabase's CDN had already cached the objects under
 * their old /object/public/ URLs, and flipping a bucket's `public` flag in the
 * database does not tell the CDN anything. Smart CDN invalidates on an object
 * *update* or *delete* through the Storage API, so that is what this does.
 *
 * It re-uploads each object with byte-identical content:
 *
 *   download  ->  verify the bytes came back  ->  upload with upsert
 *
 * Nothing is deleted, and nothing is written unless the download succeeded
 * first, so a failure at any point leaves the original object exactly where it
 * was. Content type is preserved from the stored metadata; losing it would
 * make a document download as a blob.
 *
 * Run with the service role key, which bypasses RLS — these buckets have no
 * UPDATE policy by design:
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/purge-chat-media-cdn.mjs
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/purge-chat-media-cdn.mjs --dry-run
 *
 * The key is read from the environment and never printed. Allow up to a minute
 * afterwards for the invalidation to reach every data centre.
 */

import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKETS = ["chat-media", "voice-notes"];
const DRY = process.argv.includes("--dry-run");

if (!URL || !KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Both live in .env.local; export them for this command only.",
  );
  process.exit(1);
}

const supabase = createClient(URL, KEY, { auth: { persistSession: false } });

/** Every object in a bucket, walking the folder-per-user layout. */
async function listAll(bucket) {
  const out = [];
  const { data: folders, error } = await supabase.storage.from(bucket).list("", { limit: 1000 });
  if (error) throw new Error(`list ${bucket}: ${error.message}`);

  for (const folder of folders ?? []) {
    // A row with no id is a folder; a row with one is a file at the root.
    if (folder.id) {
      out.push({ path: folder.name, type: folder.metadata?.mimetype });
      continue;
    }
    const { data: files, error: err } = await supabase.storage
      .from(bucket)
      .list(folder.name, { limit: 1000 });
    if (err) throw new Error(`list ${bucket}/${folder.name}: ${err.message}`);
    for (const f of files ?? []) {
      if (f.id) out.push({ path: `${folder.name}/${f.name}`, type: f.metadata?.mimetype });
    }
  }
  return out;
}

async function touch(bucket, path, contentType) {
  const { data: blob, error: dlErr } = await supabase.storage.from(bucket).download(path);
  if (dlErr || !blob) return { ok: false, why: `download: ${dlErr?.message ?? "no body"}` };

  const bytes = new Uint8Array(await blob.arrayBuffer());
  // Never overwrite with nothing. An empty read means something went wrong
  // upstream, and re-uploading it would destroy the file.
  if (bytes.byteLength === 0) return { ok: false, why: "downloaded 0 bytes — refusing to write" };
  if (DRY) return { ok: true, bytes: bytes.byteLength, skipped: true };

  const { error: upErr } = await supabase.storage.from(bucket).upload(path, bytes, {
    upsert: true,
    contentType: contentType || blob.type || "application/octet-stream",
    cacheControl: "3600",
  });
  if (upErr) return { ok: false, why: `upload: ${upErr.message}` };
  return { ok: true, bytes: bytes.byteLength };
}

let done = 0;
let failed = 0;

for (const bucket of BUCKETS) {
  const objects = await listAll(bucket);
  console.log(`\n${bucket}: ${objects.length} object(s)${DRY ? " [dry run]" : ""}`);

  for (const { path, type } of objects) {
    const r = await touch(bucket, path, type);
    if (r.ok) {
      done++;
      console.log(`  ok    ${path} (${r.bytes} bytes)${r.skipped ? " — not written" : ""}`);
    } else {
      failed++;
      console.error(`  FAIL  ${path} — ${r.why}`);
    }
  }
}

console.log(
  `\n${done} touched, ${failed} failed.` +
    (DRY
      ? "\nDry run: nothing was written."
      : "\nGive the CDN up to a minute, then re-check an old /object/public/ URL — it should return 400."),
);
process.exit(failed ? 1 : 0);
