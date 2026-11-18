import Constants from "expo-constants";

/**
 * The website's origin, which the app needs for exactly two things.
 *
 * Google sign-in returns to the SITE's callback, not to the app's own
 * scheme — `nativeReturnUrl` in @hypefy/core explains why: going through
 * the site means the only redirect Supabase has to allow is the one web
 * sign-in already requires. When the app's `chat.hypefy://` link was not on
 * that allowlist, Supabase quietly sent people to the website instead and
 * they ended up signed in to a browser tab.
 *
 * Email confirmation lands on the same callback.
 *
 * It is config rather than a constant so a preview deployment can be signed
 * in to, and it falls back to production rather than throwing: a wrong
 * origin breaks Google sign-in, where a missing one would break the app's
 * startup, and those are not the same severity.
 */
export const DEFAULT_SITE = "https://app.hypefy.chat";

export function siteOrigin(): string {
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
  const configured =
    (typeof extra.siteUrl === "string" ? extra.siteUrl : "") ||
    process.env.EXPO_PUBLIC_SITE_URL ||
    DEFAULT_SITE;
  // No trailing slash, because every caller appends a path.
  return configured.replace(/\/+$/, "");
}
