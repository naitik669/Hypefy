import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { readAal } from "@/lib/mfa-gate";
import { removeFilesOf } from "@/lib/account-files";
import { bearerToken } from "@hypefy/core/account-delete";

/**
 * POST /api/account/delete — permanently deletes the calling user's account.
 * Auth comes from the session cookie on the web, or from an
 * `Authorization: Bearer <access token>` header from the phone, which has no
 * cookie the site can read. The actual deletion needs the service role key
 * (auth.admin). All app rows cascade via FKs to profiles/auth.users.
 *
 * Their files do not cascade: nothing in Postgres can delete a Storage
 * object. They are removed first, and the account only goes once they have:
 * a failure there leaves an account the person can try again on, where the
 * other order would leave files nobody owns and nobody can ask about.
 */
export async function POST(request: Request) {
  // A bearer token, when sent, is the ONLY credential considered: it is
  // validated against GoTrue by getUser(token), exactly as a cookie session
  // is, and a request carrying a bad one is a 401 rather than a fall-through
  // to whatever cookie happens to ride along.
  const token = bearerToken(request.headers.get("authorization"));
  const supabase = token ? null : await createClient();
  const {
    data: { user },
  } = token
    ? await createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } },
      ).auth.getUser(token)
    : await supabase!.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // The step-up dialog on the client is advisory — this is the check that
  // counts. An account with a second factor must present it before the one
  // action nothing can undo, and a route handler is reachable without ever
  // rendering the component that asks.
  //
  // The middleware's own gate cannot cover this: it deliberately does not
  // redirect /api/* (an API caller needs JSON, not an HTML login page), so
  // routes that matter carry their own.
  const hasFactor = (user.factors ?? []).some((f) => f.status === "verified");
  if (hasFactor) {
    // The token getUser() just validated — the header's, or the cookie
    // session's. readAal only decodes, which is safe for exactly that reason.
    const accessToken =
      token ?? (await supabase!.auth.getSession()).data.session?.access_token;
    if (readAal(accessToken) !== "aal2") {
      return NextResponse.json({ error: "mfa_required" }, { status: 403 });
    }
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json(
      {
        error:
          "Account deletion isn't configured (missing SUPABASE_SERVICE_ROLE_KEY)",
      },
      { status: 503 }
    );
  }

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    {
      auth: { persistSession: false },
    }
  );

  const files = await removeFilesOf(admin, user.id);
  if (!files.ok) {
    Sentry.captureException(new Error(`account files: ${files.error}`), {
      tags: { route: "account/delete" },
      extra: { removed: files.removed },
    });
    return NextResponse.json(
      { error: "Couldn't remove your photos and videos. Nothing else was deleted. Try again." },
      { status: 500 },
    );
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    Sentry.captureException(error, { tags: { route: "account/delete" } });
    return NextResponse.json({ error: "Deletion failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
