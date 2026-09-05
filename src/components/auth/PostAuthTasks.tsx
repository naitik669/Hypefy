"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { upsertSavedAccount } from "@/lib/saved-accounts";
import { clearPendingOAuth, readPendingOAuth } from "@/lib/pending-oauth";

/**
 * Finishes the half of a Google sign-in that the redirect interrupted.
 *
 * Mounted at the root rather than inside (app), because the two places an
 * OAuth return can land — /setup-profile for a new account, /home for an
 * existing one — sit in different layouts. It is inert unless there is
 * parked work AND a session to apply it to, so the cost on every other page
 * is one localStorage read.
 */
export function PostAuthTasks() {
  useEffect(() => {
    const pending = readPendingOAuth();
    if (!pending) return;

    let cancelled = false;

    (async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      // Still mid-flow, or the user abandoned the consent screen. Leave the
      // entry alone; it expires on its own.
      if (!session || cancelled) return;

      // Record the age gate for accounts created through Google.
      //
      // This now writes the profiles column via set_date_of_birth (0053), not
      // user_metadata: metadata is client-writable, so it was never evidence of
      // anything. The RPC is write-once and rejects under-13 server-side, so a
      // failure here is not a hole — the /age-check gate asks again on the next
      // render, which is exactly what should happen if this step is lost.
      if (pending.dob) {
        await supabase.rpc("set_date_of_birth", { p_dob: pending.dob });
      }

      if (pending.addAccount) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, display_name, username, avatar_hue, avatar_url")
          .eq("id", session.user.id)
          .maybeSingle();

        upsertSavedAccount({
          userId: session.user.id,
          email: session.user.email ?? "",
          displayName: (profile as any)?.display_name ?? null,
          username: (profile as any)?.username ?? null,
          avatarHue: (profile as any)?.avatar_hue ?? null,
          avatarUrl: (profile as any)?.avatar_url ?? null,
          accessToken: session.access_token,
          refreshToken: session.refresh_token,
        });
      }

      if (!cancelled) clearPendingOAuth();
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
