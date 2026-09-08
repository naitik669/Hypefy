import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { needsSecondFactor } from "@/lib/mfa-gate";

/**
 * Refreshes the Supabase auth session on every request and keeps cookies in
 * sync. Called from the root proxy (Next 16's renamed middleware).
 */
export async function updateSession(request: NextRequest) {
  // Server components cannot read the pathname, and the suspension gate in the
  // (app) layout has to let a few routes through — support, guidelines,
  // account settings — or a suspended user has no way to appeal or leave.
  // Carrying it on a request header is the standard way to hand it down.
  request.headers.set("x-pathname", request.nextUrl.pathname);
  let supabaseResponse = NextResponse.next({ request });

  // Missing Supabase env used to short-circuit auth entirely, which meant a
  // misconfigured production deploy served every protected route to anyone.
  // Fail closed: only development may run unauthenticated.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Supabase env vars are missing. Refusing to serve requests without auth."
      );
    }
    return supabaseResponse;
  }

  // Skip session refresh on Next.js prefetch requests. Link prefetching fires
  // many concurrent requests; if each refreshes the token at once, the rotation
  // race can invalidate the session and log the user out. Only real navigations
  // (and the client's own timer) should refresh.
  const isPrefetch =
    request.headers.get("next-router-prefetch") !== null ||
    request.headers.get("purpose") === "prefetch" ||
    request.headers.get("x-middleware-prefetch") !== null;
  if (isPrefetch) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: do not run code between createServerClient and getUser().
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  // Gate the in-app routes. Unauthenticated users are sent to the landing.
  // Note: /shots/[id] deep links stay public (shareable, like /p and /u);
  // only the /shots feed itself is gated.
  const protectedPrefixes = [
    "/admin",
    "/home",
    "/shows",
    "/discover",
    "/messages",
    "/profile",
    "/setup-profile",
    // The one-time date-of-birth prompt. Signed-in only, like setup-profile:
    // the (app) layout redirects here, and an anonymous visitor has no profile
    // to record it against.
    "/age-check",
    "/create",
    "/notifications",
    "/search",
    "/settings",
  ];
  const { pathname } = request.nextUrl;
  const isProtected =
    protectedPrefixes.some((p) => pathname.startsWith(p)) ||
    pathname === "/shots";

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    const redirectResponse = NextResponse.redirect(url);
    // Carry over any refreshed cookies so we never drop the session on redirect.
    supabaseResponse.cookies.getAll().forEach((c) => {
      redirectResponse.cookies.set(c.name, c.value);
    });
    return redirectResponse;
  }

  // ── Second factor ──────────────────────────────────────────────────
  //
  // The thing that makes two-factor real. The old "two-step" flag was read by
  // one browser `if`, so Google sign-in, the account switcher, a direct GoTrue
  // password grant and even a failed code-send all walked past it. None of
  // those need a line of their own here: every one of them produces an AAL1
  // session, and this fires on the first protected navigation that session
  // makes.
  //
  // Kill switch, because the failure mode is locking real people out of their
  // own accounts and a deploy is slower than an env var.
  if (user && isProtected) {
    // The factors come from the getUser() RESPONSE above — a live call to
    // GoTrue, so it is authoritative.
    //
    // NOT mfa.getAuthenticatorAssuranceLevel(): its no-argument path reads
    // user.factors out of the STORED COOKIE. Stale cookie data would make this
    // gate silently pass, and a fail-open staleness bug is the worst possible
    // shape for an auth check.
    //
    // getSession() only supplies the token to read `aal` off; getUser() has
    // already validated that same token, which is what makes reading it safe.
    //
    // Fetched only when a factor actually exists. Almost nobody has one, and
    // there is no reason to make every request of every other account pay for
    // a lookup whose answer cannot matter to them.
    const hasFactor = (user.factors ?? []).some((f) => f.status === "verified");
    const accessToken = hasFactor
      ? (await supabase.auth.getSession()).data.session?.access_token
      : undefined;

    if (
      needsSecondFactor({
        hasUser: true,
        userError: !!userError,
        factors: user.factors,
        accessToken,
        isProtected,
        enforce: process.env.MFA_ENFORCE !== "0",
      })
    ) {
      const url = request.nextUrl.clone();
      url.pathname = "/verify-2fa";
      url.search = "";
      const redirectResponse = NextResponse.redirect(url);
      // Same cookie carry-over as the signed-out gate. Without it a token
      // refreshed during this request is dropped, and the user is signed out
      // on their way to the screen that exists to sign them in.
      supabaseResponse.cookies.getAll().forEach((c) => {
        redirectResponse.cookies.set(c.name, c.value);
      });
      return redirectResponse;
    }
  }

  return supabaseResponse;
}
