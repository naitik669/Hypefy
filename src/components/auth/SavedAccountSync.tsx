"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { getSavedAccounts, upsertSavedAccount } from "@/lib/saved-accounts";

/**
 * Keeps the account switcher's stored tokens current.
 *
 * Each saved account was a snapshot taken once, at the moment it was added.
 * Supabase rotates refresh tokens on use, so as soon as you actually switch
 * to an account its session refreshes and the copy sitting in
 * hypefy_accounts is spent. The next switch to it fails with an invalid
 * refresh token, the tile prunes itself, and the account quietly falls out
 * of the switcher — which looks exactly like adding it never worked.
 *
 * Listening to auth state and re-saving on every refresh keeps the stored
 * copy in step with the live session.
 *
 * Only accounts already in the switcher are touched. Writing every sign-in
 * here would silently enrol accounts nobody asked to keep on the device,
 * and these entries are credentials — they are added deliberately, by
 * adding an account, or not at all.
 */
export function SavedAccountSync() {
  useEffect(() => {
    const supabase = createClient();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) return;
      if (
        event !== "TOKEN_REFRESHED" &&
        event !== "SIGNED_IN" &&
        event !== "INITIAL_SESSION"
      ) {
        return;
      }

      const existing = getSavedAccounts().find(
        (a) => a.userId === session.user.id
      );
      if (!existing) return;

      // Same identity, current credentials.
      if (
        existing.accessToken === session.access_token &&
        existing.refreshToken === session.refresh_token
      ) {
        return;
      }

      upsertSavedAccount({
        ...existing,
        email: session.user.email ?? existing.email,
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
      });
    });

    return () => subscription.unsubscribe();
  }, []);

  return null;
}
