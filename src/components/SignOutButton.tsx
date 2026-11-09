"use client";

import { useState } from "react";
import { forgetAllIdentities } from "@/lib/e2ee/store";
import { clearChatMediaCache } from "@/lib/chat-media-url";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

/**
 * Sign out, with a confirmation.
 *
 * It used to fire on the first tap, sitting immediately below a column of
 * ordinary settings rows — so the mis-tap that costs you nothing anywhere else
 * on that screen ends your session here. Cheap to undo in principle, but only
 * if you remember the password, which is exactly the person this catches.
 */
export function SignOutButton() {
  const supabase = createClient();
  const [confirm, setConfirm] = useState(false);

  async function handleSignOut() {
    // The key goes with the session. A signed-out device that kept it
    // could still read every encrypted message it had already received.
    await forgetAllIdentities();
    // Signed links are bearer links; do not leave the last account's in memory
    // for whoever signs in next in this tab.
    clearChatMediaCache();
    // An already-invalid session makes signOut reject, and this runs
    // inside ConfirmDialog's onConfirm — an unhandled rejection there
    // leaves the keys and media cache cleared and the dialog stuck,
    // with the user still apparently signed in. Locally we are signed
    // out either way, so the navigation below must happen regardless.
    try {
      await supabase.auth.signOut();
    } catch {
      /* the local state is already gone; leaving is what matters */
    }
    // A hard navigation, not router.push. Next's router cache still
    // holds payloads rendered for the account being left, so a soft
    // navigation can show the previous user's shell. AuthCard makes
    // exactly this point in two places and uses window.location there.
    window.location.href = "/";
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirm(true)}
        className="flex h-10 items-center justify-center rounded-xl border border-border/60 bg-surface px-4 text-sm font-semibold text-muted transition-colors hover:border-danger/40 hover:text-danger active:scale-[0.99]"
      >
        Sign out
      </button>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={handleSignOut}
        icon={LogOut}
        title="Sign out"
        body="You'll need your password to get back in. Saved accounts stay on this device."
        confirmLabel="Sign out"
      />
    </>
  );
}
