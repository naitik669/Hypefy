import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient as createSupabase } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

/**
 * GET /api/oneshot/[messageId]
 *
 * Streams a view-once photo's bytes exactly once, then deletes the storage
 * object. Deliberately a byte proxy, not a signed URL: a signed URL is
 * replayable and CDN-cacheable within its TTL even after "viewing" it — the
 * single-view guarantee here comes entirely from the atomic DB claim
 * (claim_oneshot), which this route calls AS the requesting user via their
 * session cookie, so RLS/auth.uid() inside the RPC resolve correctly. Once
 * that claim succeeds, nothing about the response caching or URL sharing
 * matters — the claim itself can never succeed twice.
 *
 * Node runtime (not edge): needs Buffer + the service-role storage client.
 */
export const runtime = "nodejs";

function adminClient() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const { messageId } = await params;

  // Cookie-authed client — identifies the caller so claim_oneshot runs with
  // the correct auth.uid(), exactly as if the browser had called the RPC
  // directly (it never does; this route is the only caller).
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: path, error: claimErr } = await supabase.rpc("claim_oneshot", { p_message_id: messageId });
  if (claimErr || !path) {
    // Wrong person, already opened, expired, or rate-limited — all
    // indistinguishable to the caller on purpose (no oracle for "does this
    // message exist / was it opened by someone else").
    return NextResponse.json({ error: "This photo is no longer available." }, { status: 404 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  const admin = adminClient();

  const { data: blob, error: dlErr } = await admin.storage.from("oneshot-media").download(path);
  if (dlErr || !blob) {
    Sentry.captureException(dlErr ?? new Error("oneshot download returned no data"), {
      tags: { route: "oneshot-claim" },
    });
    // The claim already succeeded — the recipient's one view is spent even
    // though the bytes didn't come back. Don't retry-on-refresh into a second
    // claim attempt; report it as gone, matching what it now effectively is.
    return NextResponse.json({ error: "This photo is no longer available." }, { status: 500 });
  }

  // Best-effort cleanup — fire-and-forget. The single-view guarantee doesn't
  // depend on this succeeding (the claim already did that); this just frees
  // storage promptly instead of waiting for the reap cron. reap_oneshots only
  // sweeps opened_at IS NULL rows, which this one no longer is, so a failure
  // here would otherwise leak the object with no later cleanup — logged, not
  // swallowed silently.
  admin.storage.from("oneshot-media").remove([path]).then(({ error }) => {
    if (error) Sentry.captureException(error, { tags: { route: "oneshot-cleanup" }, extra: { path } });
  });

  const buf = Buffer.from(await blob.arrayBuffer());
  return new NextResponse(buf, {
    headers: {
      "Content-Type": blob.type || "image/jpeg",
      "Cache-Control": "no-store, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
