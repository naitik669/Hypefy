import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";

/**
 * Staying signed in, and leaving safely.
 *
 * Three defects behind "login glitches": a refreshed token silently
 * downgraded to a session cookie, an open redirect on the one route
 * that has just minted a session, and a sign-out that left the
 * previous account's pages in the router cache.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const middleware = read("src/lib/supabase/middleware.ts");
const callback = read("src/app/auth/callback/route.ts");
const signOut = read("src/components/SignOutButton.tsx");
const authCard = read("src/components/auth/AuthCard.tsx");
const nativeLink = read("src/components/native/NativeAuthLink.tsx");
const rootLayout = read("src/app/layout.tsx");
const nativeShell = read("src/components/native/NativeShell.tsx");

describe("a refreshed session survives a redirect intact", () => {
  it("the whole cookie is carried, not just its name and value", () => {
    // Copying name+value dropped maxAge, expires, sameSite, secure,
    // httpOnly and domain, so a token refreshed on a request that also
    // redirected became a session cookie — signed out on app close.
    expect(middleware).not.toContain("redirectResponse.cookies.set(c.name, c.value)");
    expect(middleware.match(/redirectResponse\.cookies\.set\(c\)/g) ?? []).toHaveLength(2);
  });

  it("and both carry-over sites were fixed, not just the first", () => {
    // There is one in the signed-out gate and one in the MFA gate.
    expect(middleware.match(/supabaseResponse\.cookies\.getAll\(\)/g) ?? []).toHaveLength(2);
  });
});

describe("the callback cannot be pointed at another host", () => {
  it("the forwarded host is no longer trusted as given", () => {
    expect(callback).not.toContain("return NextResponse.redirect(`https://${forwardedHost}${next}`)");
    expect(callback).toContain("function siteOrigin(");
  });

  it("a configured site URL wins outright", () => {
    const fn = callback.slice(callback.indexOf("function siteOrigin("), callback.indexOf("/** The app's own link"));
    expect(fn).toContain("process.env.NEXT_PUBLIC_SITE_URL");
  });

  it("otherwise only the site's own apex or a subdomain of it is accepted", () => {
    const fn = callback.slice(callback.indexOf("function siteOrigin("), callback.indexOf("/** The app's own link"));
    expect(fn).toContain("forwarded === base || forwarded.endsWith(`.${base}`)");
    // And a host that is not a bare hostname never gets through.
    expect(fn).toContain("/^[a-z0-9.-]+$/i.test(forwarded)");
  });

  it("both exits go through it, including the failure one", () => {
    expect(callback).toContain("`${siteOrigin(request, origin)}${next}`");
    expect(callback).toContain("`${siteOrigin(request, origin)}/signin?error=auth_failed`");
  });

  it("and a failed exchange is no longer discarded in silence", () => {
    expect(callback).toContain("[auth/callback] code exchange failed:");
  });
});

describe("signing out actually leaves", () => {
  it("with a hard navigation, like the two places that document why", () => {
    expect(signOut).toContain('window.location.href = "/";');
    expect(signOut).not.toContain('router.push("/")');
  });

  it("and an already-dead session cannot strand the dialog", () => {
    const fn = signOut.slice(signOut.indexOf("async function handleSignOut()"));
    expect(fn).toContain("try {");
    expect(fn).toContain("await supabase.auth.signOut();");
    expect(fn).toContain("} catch {");
  });
});

describe("native Google sign-in has somewhere to land", () => {
  it("the deep-link listener is mounted in the root layout", () => {
    // Not in NativeShell: the (app) layout returns a bare shell for a
    // signed-out user and never reaches it, so on /signin — the only
    // screen where a Google sign-in starts — nothing was listening.
    expect(rootLayout).toContain("<NativeAuthLink />");
    expect(rootLayout).toContain('from "@/components/native/NativeAuthLink"');
  });

  it("and NativeShell no longer keeps a second copy of it", () => {
    expect(nativeShell).not.toContain("appUrlOpen");
  });

  it("there is exactly one such listener in the whole app", () => {
    // Counted over src/, and on the registration rather than the word:
    // the prose above mentions appUrlOpen too, and a count of the bare
    // string passed while a second listener existed.
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = `${dir}/${e.name}`;
        if (e.isDirectory()) return walk(full);
        return /.tsx?$/.test(e.name) ? [full] : [];
      });
    const files = walk("src");
    const registrations = files.flatMap((f: string) =>
      (read(f).match(/addListener\(\s*"appUrlOpen"/g) ?? []).map(() => f.replace(/\\/g, "/")),
    );
    expect(registrations).toEqual(["src/components/native/NativeAuthLink.tsx"]);
  });

  it("a code is only ever exchanged once", () => {
    // The interstitial redirects itself and also offers a button, and
    // Android can deliver an intent twice. The second exchange always
    // fails, which would bounce an already-signed-in user to /signin.
    expect(nativeLink).toContain("const used = new Set<string>();");
    expect(nativeLink).toContain("if (!code || used.has(code)) return;");
    expect(nativeLink).toContain("used.add(code);");
  });

  it("and it lands with a hard navigation", () => {
    expect(nativeLink).toContain('window.location.href = ok ? "/" : "/signin?error=auth_failed";');
  });
});

describe("the Google button recovers", () => {
  it("it is released when the native flow hands off", () => {
    // The Custom Tab is a separate window: back out of it and nothing
    // else here ever runs, so the button stayed on "Redirecting…".
    // The clear immediately before the hand-off return. The error
    // branch just above also calls setGoogleLoading(false), so a slice
    // that merely contains the call passed with this one deleted.
    expect(authCard).toContain("      setGoogleLoading(false);\n      return;\n    }");
    // And the error branch just above keeps its own clear — same
    // stuck-button symptom, reached when startNativeGoogleSignIn
    // fails outright rather than handing off.
    expect(authCard).toContain("        setError(message);\n        setGoogleLoading(false);");
  });

  it("and when the page comes back from the back-forward cache", () => {
    expect(authCard).toContain('window.addEventListener("pageshow", onShow)');
    expect(authCard).toContain("if (e.persisted) setGoogleLoading(false);");
  });

  it("a failed sign-in finally says something", () => {
    // Two producers of ?error=auth_failed and, until now, no consumer.
    expect(authCard).toContain('params.get("error") === "auth_failed"');
  });
});
