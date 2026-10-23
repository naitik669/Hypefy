import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import {
  GATE_COOKIE,
  hasValidGateCookie,
  isGateDisabled,
  isOpenPath,
} from "@/lib/invite-gate";
import { maintenanceAnswer, maintenanceOn } from "@/lib/maintenance";

// Next 16: "Proxy" is the renamed Middleware. Runs before each request to
// refresh the Supabase session and guard protected routes.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Down on purpose: answer before anything reaches Supabase, which may be
  // the thing that is down. See src/lib/maintenance.ts.
  if (maintenanceOn()) {
    const answer = maintenanceAnswer(pathname);
    if (answer === "api") {
      return NextResponse.json({ error: "maintenance" }, { status: 503, headers: { "retry-after": "120" } });
    }
    if (answer === "page") {
      return NextResponse.rewrite(new URL("/maintenance", request.url), {
        status: 503,
        headers: { "retry-after": "120", "cache-control": "no-store" },
      });
    }
    if (answer === "pass") return NextResponse.next();
  }

  // Pre-launch invite wall. Sits in front of the session refresh so an
  // uninvited visitor never reaches Supabase at all. Set APP_INVITE_CODE
  // to switch it on; leaving it unset disables the gate entirely.
  if (!isGateDisabled() && !isOpenPath(pathname)) {
    const ok = await hasValidGateCookie(
      request.cookies.get(GATE_COOKIE)?.value
    );

    if (!ok) {
      // An API route must never answer with the gate PAGE. Rewriting sent
      // back HTML under a 200, so a client fetch sailed past both its
      // status checks and then threw parsing markup as JSON — which is how
      // the GIF picker came to report a generic failure. JSON with a real
      // status lets callers tell "not allowed" from "broken".
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "invite_required" }, { status: 401 });
      }

      // Rewrite rather than redirect: the visitor keeps the URL they asked
      // for, so following the link again after entering the code lands
      // them where they meant to go.
      return NextResponse.rewrite(new URL("/gate", request.url));
    }
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets and image optimization.
     *
     * The dot before the extension group is escaped, and that matters: as
     * `.` it matched ANY character, so any path whose last segment merely
     * ENDED in those letters skipped the proxy — and with it the invite
     * gate, the session refresh and the two-factor redirect. Checked
     * against the compiled regex: /tag/xpng, /api/oneshot/abc-png and
     * /messages/1jpg all slipped through, and /tag/[tag] is a path any
     * visitor chooses. Next's own docs escape it for this reason.
     */
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
