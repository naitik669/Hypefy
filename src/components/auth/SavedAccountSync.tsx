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

      // Refresh the display fields too, not just the tokens. They were
      // snapshotted when the account was added, so a photo or name set
      // afterwards never reached the switcher — which is why another
      // account showed a letter where its picture should be.
      void (async () => {
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name, username, avatar_hue, avatar_url")
          .eq("id", session.user.id)
          .maybeSingle();

        const next = {
          ...existing,
          email: session.user.email ?? existing.email,
          displayName: (profile as any)?.display_name ?? existing.displayName,
          username: (profile as any)?.username ?? existing.username,
          avatarHue: (profile as any)?.avatar_hue ?? existing.avatarHue,
          avatarUrl: (profile as any)?.avatar_url ?? existing.avatarUrl,
          accessToken: session.access_token,
          refreshToken: session.refresh_token,
        };

        // Nothing moved — skip the write so other tabs are not woken by a
        // storage event for an identical value.
        if (JSON.stringify(next) === JSON.stringify(existing)) return;
        upsertSavedAccount(next);
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

  return null;
}
