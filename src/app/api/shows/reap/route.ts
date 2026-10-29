import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient as createSupabase } from "@supabase/supabase-js";
import { secretMatches } from "@/lib/api-guard";
import { SHOW_ARCHIVE_DAYS, reapableObjectPath } from "@/lib/show-media";

/**
 * POST /api/shows/reap
 *
 * Called by pg_net from public.reap_expired_shows(), one Show at a time,
 * for Shows whose archive window has run out. Postgres cannot delete a
 * Storage object — only the Storage API can — which is why this Node hop
 * exists, exactly as /api/oneshot/reap does for OneShots.
 *
 * Until this ran, nothing ever deleted a Show: no cron, no clause in the
 * policy, nothing in 0154's retention sweep. Every expired Show and its
 * 25 MB ceiling of media stayed for ever.
 *
 * The secret is compared against SHOW_REAP_SECRET, which must match the
 * value in Supabase Vault under 'show_reap_secret' — two independent
 * copies of one value, not something this route can check against the DB.
 */
export const runtime = "nodejs";

function adminClient() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function POST(req: NextRequest) {
  if (!secretMatches(req.headers.get("x-show-reap-secret"), process.env.SHOW_REAP_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  const showId = typeof body?.show_id === "string" ? body.show_id : null;
  if (!showId) {
    return NextResponse.json({ error: "missing show_id" }, { status: 400 });
  }

  const admin = adminClient();

  /**
   * The caller says this Show is finished; this asks the database.
   *
   * The id arrives over the wire, so the window, the Showcase check and
   * the owner all get read here rather than trusted. A leaked secret
   * should not be able to delete a Show somebody posted this morning.
   */
  const { data: show, error: readErr } = await admin
    .from("shows")
    .select("id, user_id, media_url, expires_at")
    .eq("id", showId)
    .maybeSingle();

  if (readErr) {
    Sentry.captureException(readErr, { tags: { route: "shows-reap" }, extra: { showId } });
    return NextResponse.json({ error: "lookup failed" }, { status: 500 });
  }
  // Already gone. A repeat of a call that worked is not a failure.
  if (!show) return NextResponse.json({ ok: true, already: true });

  const cutoff = Date.now() - SHOW_ARCHIVE_DAYS * 86_400_000;
  if (!show.expires_at || new Date(show.expires_at).getTime() > cutoff) {
    return NextResponse.json({ error: "not past the archive window" }, { status: 409 });
  }
  // The is_showcase flag used to be asked here as well. 0185 moved
  // every flagged Show onto a board, so the board check below is now
  // the whole answer — and it is the same condition can_see_show uses,
  // which means what survives and what is readable finally agree.
  const { count: onBoard, error: boardErr } = await admin
    .from("showcase_items")
    .select("id", { count: "exact", head: true })
    .eq("show_id", showId)
    .is("removed_at", null);

  if (boardErr) {
    Sentry.captureException(boardErr, { tags: { route: "shows-reap" }, extra: { showId } });
    return NextResponse.json({ error: "lookup failed" }, { status: 500 });
  }
  // A Show on a Showcase board is meant to outlive its day.
  if ((onBoard ?? 0) > 0) return NextResponse.json({ error: "on a board" }, { status: 409 });

  // Only this Show's own upload. A shared post's image or a Shot's video
  // sitting in media_url belongs to content that is still there.
  const path = reapableObjectPath(show.media_url, show.user_id);
  if (path) {
    const { error: rmErr } = await admin.storage.from("show-media").remove([path]);
    if (rmErr) {
      // The row stays, so the next run tries again rather than orphaning
      // the bytes with nothing left pointing at them.
      Sentry.captureException(rmErr, { tags: { route: "shows-reap" }, extra: { showId, path } });
      return NextResponse.json({ error: "delete failed" }, { status: 500 });
    }
  }

  const { error: delErr } = await admin.from("shows").delete().eq("id", showId);
  if (delErr) {
    Sentry.captureException(delErr, { tags: { route: "shows-reap" }, extra: { showId } });
    return NextResponse.json({ error: "row delete failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, removedObject: !!path });
}
