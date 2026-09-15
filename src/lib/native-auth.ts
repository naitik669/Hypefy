"use client";

import { Browser } from "@capacitor/browser";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Google sign-in for the native shell.
 *
 * Google refuses OAuth inside embedded WebViews (`403 disallowed_useragent`),
 * so the app cannot simply navigate to the consent screen the way the website
 * does. The accepted route is a Chrome Custom Tab — a real browser, which
 * Google allows — and a deep link back into the app afterwards.
 *
 * That deep link is also why `redirectTo` cannot stay pointed at
 * `/auth/callback`: the server route exchanges the code and sets cookies in
 * *the Custom Tab's* cookie jar, which the WebView cannot read. The session
 * would be created for a browser the user never sees again. So the code comes
 * back into the app and is exchanged here instead, by the browser Supabase
 * client — which writes cookies the server components can read.
 */

import { NATIVE_AUTH_REDIRECT, nativeReturnUrl } from "@/lib/native-auth-link";

export { NATIVE_AUTH_REDIRECT };

/** Starts the flow. Returns an error message, or null when the Custom Tab
 *  opened and the rest happens via the deep link. */
export async function startNativeGoogleSignIn(
  supabase: SupabaseClient,
): Promise<string | null> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      // Via the website's callback, which bounces the code into the app.
      redirectTo: nativeReturnUrl(window.location.origin),
      // Without this the SDK navigates the WebView itself, which is exactly
      // what Google blocks. We want the URL so we can hand it to a real
      // browser.
      skipBrowserRedirect: true,
    },
  });

  if (error) return error.message;
  if (!data?.url) return "Could not start Google sign-in.";

  try {
    await Browser.open({ url: data.url });
    return null;
  } catch {
    return "Couldn't open the browser for sign-in.";
  }
}

/** Is this the deep link we are waiting for? */
export function isAuthCallbackUrl(url: string): boolean {
  return url.startsWith("chat.hypefy://auth");
}

/**
 * Finishes the flow from the deep-link URL.
 *
 * Returns true when a session now exists.
 */
export async function completeNativeSignIn(
  supabase: SupabaseClient,
  url: string,
): Promise<boolean> {
  // Custom-scheme URLs are not always parseable by `new URL` across engines,
  // so the query string is read directly rather than trusted to it.
  const query = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
  const params = new URLSearchParams(query);

  // Close the tab first either way — leaving it up over the app looks like
  // the sign-in hung, even when it succeeded.
  try { await Browser.close(); } catch { /* already closed by the OS */ }

  if (params.get("error")) return false;

  const code = params.get("code");
  if (!code) return false;

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  return !error;
}
