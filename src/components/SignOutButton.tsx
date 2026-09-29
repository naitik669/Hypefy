"use client";

import { useState } from "react";
import { forgetAllIdentities } from "@/lib/e2ee/store";
import { clearChatMediaCache } from "@/lib/chat-media-url";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const supabase = createClient();
  const [confirm, setConfirm] = useState(false);

  async function handleSignOut() {
    // The key goes with the session. A signed-out device that kept it
    // could still read every encrypted message it had already received.
    await forgetAllIdentities();
    // Signed links are bearer links; do not leave the last account's in memory
    // for whoever signs in next in this tab.
    clearChatMediaCache();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
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
