import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase auth session on every request and keeps cookies in
 * sync. Called from the root proxy (Next 16's renamed middleware).
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // Until Supabase env vars are configured, skip auth handling so the app
  // still runs locally. Remove-safe once keys are in .env.local.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
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
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: do not run code between createServerClient and getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Gate the in-app routes. Unauthenticated users are sent to the landing.
  const protectedPrefixes = [
    "/home",
    "/shows",
    "/discover",
    "/messages",
    "/profile",
    "/shots",
    "/create",
    "/notifications",
    "/search",
  ];
  const isProtected = protectedPrefixes.some((p) =>
    request.nextUrl.pathname.startsWith(p),
  );

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

  return supabaseResponse;
}
