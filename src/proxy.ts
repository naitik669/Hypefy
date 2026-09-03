import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import {
  GATE_COOKIE,
  hasValidGateCookie,
  isGateDisabled,
  isOpenPath,
} from "@/lib/invite-gate";

// Next 16: "Proxy" is the renamed Middleware. Runs before each request to
// refresh the Supabase session and guard protected routes.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Pre-launch invite wall. Sits in front of the session refresh so an
  // uninvited visitor never reaches Supabase at all. Set APP_INVITE_CODE
  // to switch it on; leaving it unset disables the gate entirely.
  if (!isGateDisabled() && !isOpenPath(pathname)) {
    const ok = await hasValidGateCookie(
      request.cookies.get(GATE_COOKIE)?.value
    );

    if (!ok) {
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
     */
    "/((?!_next/static|_next/image|favicon.ico|.*.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
