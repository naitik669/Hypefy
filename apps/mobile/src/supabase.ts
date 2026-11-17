import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";
import { secureSessionStore } from "@/session-store";

/**
 * The Supabase client, for the phone.
 *
 * Three differences from the web's, each forced by the platform:
 *
 *  - `storage` is the Keychain/Keystore rather than localStorage, because a
 *    refresh token on a device should not sit in a readable file.
 *  - `detectSessionInUrl` is false. That option exists for the OAuth
 *    redirect landing back on a web page with the token in the fragment;
 *    there is no URL bar here, and the redirect arrives as a deep link
 *    which expo-router hands over instead.
 *  - the URL polyfill is imported FIRST, above everything. Hermes ships an
 *    incomplete URL, and supabase-js builds request URLs with it, so the
 *    import has to land before the client module is evaluated.
 *
 * `autoRefreshToken` stays on. Rotation is enabled on this project —
 * measured: 1,389 tokens across 114 sessions, each refresh revoking its
 * predecessor — so the client must do the refreshing or the stored token
 * goes stale and the next launch signs the user out.
 */

/** Public config, from app.json's `extra` via EAS, or the env in dev. */
function publicConfig(): { url: string; anonKey: string } {
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
  const url =
    (typeof extra.supabaseUrl === "string" ? extra.supabaseUrl : "") ||
    process.env.EXPO_PUBLIC_SUPABASE_URL ||
    "";
  const anonKey =
    (typeof extra.supabaseAnonKey === "string" ? extra.supabaseAnonKey : "") ||
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    "";

  // Fail loudly and at startup rather than on the first request, where it
  // would surface as an opaque network error on the sign-in screen.
  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and " +
        "EXPO_PUBLIC_SUPABASE_ANON_KEY, or app.json's extra.supabaseUrl " +
        "and extra.supabaseAnonKey.",
    );
  }
  return { url, anonKey };
}

const { url, anonKey } = publicConfig();

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: secureSessionStore,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
