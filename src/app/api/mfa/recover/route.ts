import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/mfa/recover — spend a recovery code to turn two-factor OFF.
 *
 * Not "sign in with a recovery code", which is what everyone expects and what
 * cannot be built: Postgres cannot mint a GoTrue JWT, and GoTrue exposes no
 * endpoint that trades an application secret for an AAL2 session. mfa.verify()
 * only accepts a TOTP code against a challenge it issued itself.
 *
 * So the code authorises deleting the factor. The user is signed out
 * everywhere — which is the correct blast radius for "I lost my phone" — and
 * gets back in with their password alone, then re-enrols. The UI says exactly
 * that before they spend one.
 *
 * The code is re-verified HERE, on the user's own client, so the RPC runs as
 * them and under its own rate limit. A boolean posted by the browser would be
 * worth nothing.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    // Fail closed and say why. The Security page refuses enrollment when this
    // is missing, so reaching here means the key went away after someone
    // enrolled — a real situation, and one they cannot solve themselves.
    return NextResponse.json(
      { error: "Account recovery isn't configured on this deployment." },
      { status: 503 },
    );
  }

  let code = "";
  try {
    const body = (await request.json()) as { code?: unknown };
    code = typeof body.code === "string" ? body.code : "";
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (!code.trim()) {
    return NextResponse.json({ error: "Enter a recovery code." }, { status: 400 });
  }

  const { data: ok, error: rpcError } = await supabase.rpc(
    "verify_mfa_recovery_code",
    { p_code: code },
  );

  if (rpcError) {
    // The rate limiter raises rather than returning false, and "too many
    // attempts" is genuinely different from "wrong code" to someone standing
    // there without their phone.
    const tooMany = /rate|limit|too many/i.test(rpcError.message);
    return NextResponse.json(
      {
        error: tooMany
          ? "Too many attempts. Wait a few minutes and try again."
          : "Couldn't check that code.",
      },
      { status: tooMany ? 429 : 500 },
    );
  }

  if (!ok) {
    return NextResponse.json(
      { error: "That code isn't valid, or it has already been used." },
      { status: 400 },
    );
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { persistSession: false } },
  );

  try {
    const { data: factors, error: listError } =
      await admin.auth.admin.mfa.listFactors({ userId: user.id });
    if (listError) throw listError;

    for (const f of factors?.factors ?? []) {
      const { error: delError } = await admin.auth.admin.mfa.deleteFactor({
        id: f.id,
        userId: user.id,
      });
      if (delError) throw delError;
    }
  } catch (err) {
    console.error("[mfa/recover]", err);
    Sentry.captureException(err, { tags: { route: "mfa/recover" } });
    return NextResponse.json(
      { error: "Couldn't turn two-factor off. Try again." },
      { status: 500 },
    );
  }

  // Codes for a factor that no longer exists are a sheet of live secrets with
  // nothing to protect.
  await supabase.rpc("clear_mfa_recovery_codes");

  // Through the RPC, not a direct insert: the "no client insert" policy on
  // notifications has `with check (false)`, so an insert from here would fail
  // silently and this alert would never once have appeared.
  //
  // Best-effort all the same — the recovery has already succeeded, and failing
  // the request over a notification would be absurd.
  await supabase.rpc("log_security_alert", {
    p_body: "Two-factor was turned off with a recovery code",
  });

  return NextResponse.json({ ok: true });
}
