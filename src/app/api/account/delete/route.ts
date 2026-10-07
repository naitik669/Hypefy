import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { readAal } from "@/lib/mfa-gate";
import { removeFilesOf } from "@/lib/account-files";

/**
 * POST /api/account/delete — permanently deletes the calling user's account.
 * Auth comes from the session cookie; the actual deletion needs the service
 * role key (auth.admin). All app rows cascade via FKs to profiles/auth.users.
 *
 * Their files do not cascade: nothing in Postgres can delete a Storage
 * object. They are removed first, and the account only goes once they have:
 * a failure there leaves an account the person can try again on, where the
 * other order would leave files nobody owns and nobody can ask about.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (readAal(session?.access_token) !== "aal2") {
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

  const admin = createAdminClient(
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
