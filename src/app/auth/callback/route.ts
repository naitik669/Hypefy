import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { NATIVE_AUTH_REDIRECT } from "@/lib/native-auth-link";

/**
 * Only same-site, absolute paths may be forwarded to.
 *
 * `next` arrives from a link in an email, so it is attacker-controllable in
 * practice. Anything that could leave the origin — a full URL, a scheme, a
 * protocol-relative "//host", or the "/\host" that some engines normalise
 * into one — falls back to "/". Password recovery is the flow that made
 * this parameter load-bearing, and recovery links are exactly what gets
 * forwarded to a victim.
 */
function safeNext(raw: string | null): string {
  if (!raw) return "/";
  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  return raw;
}

/** The app's own link, carrying only what the app needs to finish sign-in. */
function appReturnUrl(params: URLSearchParams): string {
  const out = new URLSearchParams();
  for (const key of ["code", "error", "error_description"]) {
    const v = params.get(key);
    if (v) out.set(key, v);
  }
  return `${NATIVE_AUTH_REDIRECT}?${out.toString()}`;
}

/**
 * A page that opens the app at once, with a button in case the browser
 * wants a tap before it will open an app.
 */
function appReturnPage(url: string) {
  const href = url.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Back to Hypefy</title>
<style>body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:#0a0a0a;color:#fff;font-family:system-ui,sans-serif}a{background:#a3e635;color:#0a0a0a;font-weight:800;text-decoration:none;padding:14px 28px;border-radius:999px}p{color:#8a8a8a;margin:0}</style></head>
<body><p>Signing you in…</p><a href="${href}">Open Hypefy</a><script>location.href=${JSON.stringify(url)};</script></body></html>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

// Handles the redirect back from Google OAuth, email confirmation links, and
// password recovery. Exchanges the auth code for a session, then forwards
// into the app — recovery sends `next=/reset-password` so the person lands
// on a screen that can actually change the password.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  // Google sign-in from the Android app lands here in the app's sign-in
  // browser tab, not in the app. The code must be exchanged inside the app
  // (that's where the sign-in was started, and where the session belongs),
  // so hand it straight back through the app's link instead of signing the
  // browser tab in. See src/lib/native-auth.ts.
  if (searchParams.get("app") === "1") {
    return appReturnPage(appReturnUrl(searchParams));
  }
  // Default to "/" so the smart router decides onboarding/setup/home.
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // In production we sit behind a proxy (Vercel), so `origin` can be the
      // internal host. Prefer the forwarded host to redirect to the real URL.
      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";
      if (!isLocalEnv && forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/signin?error=auth_failed`);
}
