import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient as createSupabase } from "@supabase/supabase-js";

/**
 * POST /api/oneshot/reap
 *
 * Called by pg_net from public.reap_oneshots() (0033_oneshot.sql), on a
 * 5-minute pg_cron schedule, for OneShots that expired unopened. Deletes the
 * storage object for one message at a time — Postgres itself can't delete
 * Storage objects, only the Storage API can, hence this Node hop, matching
 * the pattern /api/push already uses for its own pg_net webhook.
 *
 * The secret is compared against ONESHOT_REAP_SECRET, which must match the
 * value stored in Supabase Vault under 'oneshot_reap_secret' (see
 * docs/BACKEND.md) — the two are independent copies of the same value, not
 * something this route can verify against the DB directly.
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
  if (req.headers.get("x-oneshot-reap-secret") !== process.env.ONESHOT_REAP_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  const storagePath = typeof body?.storage_path === "string" ? body.storage_path : null;
  if (!storagePath) {
    return NextResponse.json({ error: "missing storage_path" }, { status: 400 });
  }

  const admin = adminClient();
  const { error } = await admin.storage.from("oneshot-media").remove([storagePath]);
  if (error) {
    Sentry.captureException(error, { tags: { route: "oneshot-reap" }, extra: { storagePath } });
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
