import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { ipRateLimited } from "@/lib/api-guard";
import {
  isHealthKind,
  MAX_MESSAGE,
  MAX_STACK,
  MAX_URL,
  REPORT_KINDS,
  type ReportKind,
} from "@hypefy/core/client-report";

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
    // The same limits the clients truncate to, from the module they read
    // them from — so a change in one place cannot leave the relay quietly
    // cutting more or less than the sender expected.
    const message = String(body?.message ?? "").slice(0, MAX_MESSAGE);
    if (!message) return NextResponse.json({ ok: false }, { status: 400 });

    const stack = String(body?.stack ?? "").slice(0, MAX_STACK);
    const url = String(body?.url ?? "").slice(0, MAX_URL);

    /**
     * Four kinds now, not two.
     *
     * "longtask" and "memory" are the health reports: a freeze throws
     * nothing, so the only evidence of one is a blocked main thread or
     * a heap that keeps climbing. They are tagged apart from real
     * exceptions and sent at warning level, because on their own they
     * are a symptom rather than a failure — and because mixing them
     * into the error stream would bury the exceptions.
     */
    const kind: ReportKind = REPORT_KINDS.find((k) => k === body?.kind) ?? "error";
    const health = isHealthKind(kind);

    // The two counts the crash work is about, when the client sent them.
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const vitals = { nodes: num(body?.nodes), videos: num(body?.videos), heap: num(body?.heap) };

    Sentry.captureMessage(`[client] ${message}`, {
      level: health ? "warning" : "error",
      tags: { route: "client-error", kind },
      extra: {
        stack,
        url,
        ua: req.headers.get("user-agent")?.slice(0, 200) ?? "",
        ...vitals,
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
