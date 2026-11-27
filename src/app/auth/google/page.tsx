"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  clearPendingGoogle,
  parseGoogleReturn,
  readPendingGoogle,
} from "@/lib/google-id-token";

/**
 * Where Google sends the browser back with an ID token. See
 * src/lib/google-id-token.ts for why this page exists instead of the
 * Supabase callback.
 *
 * The token arrives in the URL fragment, which the server never sees, so
 * the exchange has to happen here in the browser. The browser Supabase
 * client writes the session to cookies, so the server render of "/" that
 * follows is already signed in, and PostAuthTasks finishes the age gate
 * and account switching exactly as it does after the old redirect flow.
 */
export default function GoogleReturnPage() {
  useEffect(() => {
    const hash = window.location.hash;
    // Take the token out of the address bar and history at once.
    window.history.replaceState(null, "", window.location.pathname);

    const result = parseGoogleReturn(hash, readPendingGoogle(), Date.now());
    clearPendingGoogle();

    (async () => {
      if (result.ok) {
        const { error } = await createClient().auth.signInWithIdToken({
          provider: "google",
          token: result.token,
          nonce: result.nonce,
        });
        if (!error) {
          // A full load so the smart router at "/" renders with the new
          // cookies, the same landing as /auth/callback.
          window.location.replace("/");
          return;
        }
        console.error("[auth/google] signInWithIdToken failed:", error.message);
      } else if (result.reason !== "access_denied") {
        console.error("[auth/google] refused:", result.reason);
      }
      window.location.replace("/signin?error=auth_failed");
    })();
  }, []);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-black text-sm text-neutral-400">
      Signing you in…
    </main>
  );
}
