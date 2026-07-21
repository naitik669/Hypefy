import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

/**
 * POST /api/client-error
 *
 * Relay for the lightweight client error reporter. The browser bundle stays
 * free of the Sentry SDK; uncaught errors are POSTed here and forwarded to
 * the existing server-side Sentry. Payloads are size-capped and the client
 * self-limits to a few reports per session.
 */
export async function POST(req: NextRequest) {
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
