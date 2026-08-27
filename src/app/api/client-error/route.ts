import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { ipRateLimited } from "@/lib/api-guard";

/**
 * POST /api/client-error
 *
 * Relay for the lightweight client error reporter. The browser bundle stays
 * free of the Sentry SDK; uncaught errors are POSTed here and forwarded to
 * the existing server-side Sentry. Payloads are size-capped and the client
 * self-limits to a few reports per session.
 *
 * Deliberately NOT auth-gated: the errors most worth catching happen on
 * /signup and /signin, where nobody is signed in yet. Requiring a session
 * would silently drop exactly those. Abuse is bounded by a per-IP window
 * instead of a user-scoped one.
 */
export async function POST(req: NextRequest) {
  if (ipRateLimited(req, 20, 60 * 60 * 1000)) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  try {
    const body = await req.json();
    const message = String(body?.message ?? "").slice(0, 500);
    if (!message) return NextResponse.json({ ok: false }, { status: 400 });

    const stack = String(body?.stack ?? "").slice(0, 4000);
    const url = String(body?.url ?? "").slice(0, 300);
    const kind = body?.kind === "unhandledrejection" ? "unhandledrejection" : "error";

    Sentry.captureMessage(`[client] ${message}`, {
      level: "error",
      tags: { route: "client-error", kind },
      extra: { stack, url, ua: req.headers.get("user-agent")?.slice(0, 200) ?? "" },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
