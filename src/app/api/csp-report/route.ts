import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { ipRateLimited } from "@/lib/api-guard";

/**
 * POST /api/csp-report
 *
 * Where Content-Security-Policy-Report-Only violations land.
 *
 * The policy is report-only on purpose. The app loads third-party script
 * from Google's ad network, Tag Manager, Razorpay's checkout and Spotify's
 * playback SDK, and an enforcing policy that gets one of those origins wrong
 * breaks the feature silently for everyone. Report-only changes nothing
 * about what loads — it only says what WOULD have been blocked, which is the
 * data needed to turn it on for real.
 *
 * Why it matters here more than on most apps: src/lib/saved-accounts.ts
 * keeps every signed-in account's Supabase refresh token in localStorage so
 * the account switcher can call setSession() with it. Any script running on
 * this origin can read that, and a refresh token is a durable credential —
 * so the realistic worst case is not a defaced page, it is persistent
 * takeover of every account that has ever signed in on that browser. There
 * is no `dangerouslySetInnerHTML` anywhere in the app and React escapes JSX,
 * so the direct injection surface is small; the exposure is third-party
 * script, which is exactly what a CSP is for.
 *
 * Deliberately NOT auth-gated, like /api/client-error: the violations most
 * worth seeing happen on /signin and /signup, before anyone has a session.
 * Abuse is bounded per IP instead.
 */

/** Browsers send this as application/csp-report or application/reports+json. */
type CspReport = {
  "csp-report"?: Record<string, unknown>;
  /** The Reporting API shape, when the browser uses report-to. */
  body?: Record<string, unknown>;
};

/** One string field out of either report shape, length-capped. */
function field(r: Record<string, unknown>, ...names: string[]): string {
  for (const n of names) {
    const v = r[n];
    if (typeof v === "string" && v) return v.slice(0, 300);
  }
  return "";
}

export async function POST(req: NextRequest) {
  // Generous but bounded. A single page load can legitimately produce
  // several violations, and a browser retries, so this is higher than
  // /api/client-error's 20 — but it is still a cap.
  if (ipRateLimited(req, 60, 60 * 60 * 1000)) {
    return new NextResponse(null, { status: 429 });
  }

  try {
    const raw = (await req.json()) as CspReport | CspReport[];
    // The Reporting API posts an array; the old report-uri posts one object.
    const first = Array.isArray(raw) ? raw[0] : raw;
    const r = first?.["csp-report"] ?? first?.body ?? (first as Record<string, unknown>);
    if (!r || typeof r !== "object") return new NextResponse(null, { status: 400 });

    const directive = field(r, "effective-directive", "violated-directive", "effectiveDirective");
    const blocked = field(r, "blocked-uri", "blockedURL", "blockedURI");
    const document = field(r, "document-uri", "documentURL", "documentURI");

    // Nothing identifying the directive is nothing worth storing.
    if (!directive && !blocked) return new NextResponse(null, { status: 400 });

    Sentry.captureMessage(`CSP: ${directive || "unknown"} blocked ${blocked || "(inline)"}`, {
      level: "warning",
      tags: { kind: "csp-report", directive },
      extra: {
        blocked,
        document,
        sample: field(r, "script-sample", "sample").slice(0, 200),
        disposition: field(r, "disposition"),
      },
    });

    // 204: the browser is not waiting for anything and should not retry.
    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 400 });
  }
}
