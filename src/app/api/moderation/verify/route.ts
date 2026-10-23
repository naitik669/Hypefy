import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient as createSupabase } from "@supabase/supabase-js";
import { secretMatches } from "@/lib/api-guard";
import { MAX_DECODE_BYTES, hashImageBuffer, isOwnStorageUrl } from "@/lib/media-hash-server";

/**
 * POST /api/moderation/verify
 *
 * Recomputes the perceptual hash of recently uploaded images from the stored
 * bytes, and records what is actually true.
 *
 * The hash sent at upload time is what the client claimed. A crafted request
 * can send the hash of a different picture, so the upload check on its own
 * stops a person re-posting a photo and not a person writing an HTTP client.
 * This is the half that closes that: it fetches the object, hashes it here,
 * and overwrites the row — after which `verified` means something.
 *
 * Deliberately does NOT remove anything. A match means the picture is very
 * probably a re-upload of something a moderator removed, and removing it
 * automatically would be defensible — but a perceptual match is a judgement
 * with a false-positive rate, and wrongly deleting somebody's photo is the
 * expensive direction. It raises a report instead, which puts it in front of
 * the human who already has a queue, a takedown button and an appeal path.
 * Turning that into an auto-removal is a few lines, once there is enough
 * history to trust the rate.
 *
 * Guarded by a shared secret, the same way /api/oneshot/reap is, so it can be
 * driven by pg_cron through pg_net without a user session.
 */
export const runtime = "nodejs";
/** Decoding is not instant and a batch is several images. */
export const maxDuration = 60;

/** Images per call. Small enough to stay inside maxDuration on a cold start. */
const BATCH = 20;
/** A single object that will not arrive promptly is skipped, not waited on. */
const FETCH_TIMEOUT_MS = 10_000;

type Row = { id: string; url: string; hash: string; target_type: string; target_id: string; user_id: string | null };

function adminClient() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

/** The object's bytes, or null for anything that is not promptly a picture. */
async function fetchImage(url: string): Promise<Buffer | null> {
  // The URL comes out of a table a forged claim_media call can write to, so
  // this check is what stands between this job and being an SSRF tool.
  if (!isOwnStorageUrl(url)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: "error" });
    if (!res.ok) return null;
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_DECODE_BYTES) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    // Checked again: content-length is a claim, and a missing one is common.
    return bytes.byteLength > MAX_DECODE_BYTES ? null : bytes;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: NextRequest) {
  if (!secretMatches(req.headers.get("x-moderation-secret"), process.env.MODERATION_VERIFY_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const admin = adminClient();

  const { data, error } = await admin
    .from("media_fingerprints")
    .select("id, url, hash, target_type, target_id, user_id")
    .eq("verified", false)
    .order("created_at", { ascending: true })
    .limit(BATCH);

  if (error) {
    Sentry.captureException(error);
    return NextResponse.json({ error: "query failed" }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as Row[];
  let checked = 0;
  let changed = 0;
  let flagged = 0;
  let skipped = 0;

  for (const row of rows) {
    const bytes = await fetchImage(row.url);
    const actual = bytes ? await hashImageBuffer(bytes) : null;

    if (!actual) {
      // Gone, too big, not an image, or not ours. Marked verified anyway so
      // one unreadable object cannot wedge the queue behind it forever; the
      // hash is left as it was.
      await admin.from("media_fingerprints").update({ verified: true }).eq("id", row.id);
      skipped++;
      continue;
    }

    checked++;
    const { data: blocked } = await admin.rpc("check_media", { p_hash: actual });
    await admin.rpc("set_verified_hash", { p_id: row.id, p_hash: actual });
    if (actual !== row.hash) changed++;

    if (blocked) {
      flagged++;
      // A system report, so it lands in the queue a human already works.
      // Not a removal: see the note at the top.
      const { error: reportError } = await admin.rpc("raise_media_report", {
        p_target_type: row.target_type,
        p_target_id: row.target_id,
      });
      if (reportError) Sentry.captureException(reportError);
    }
  }

  return NextResponse.json({ ok: true, seen: rows.length, checked, changed, flagged, skipped });
}
