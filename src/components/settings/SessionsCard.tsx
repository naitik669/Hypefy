"use client";

import { useState } from "react";
import { LogOut, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/ToastProvider";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

/**
 * Sign out everywhere else.
 *
 * Sign-out has always been local scope, so a session on a device you no longer
 * have — a sold phone, a borrowed laptop, a shared computer — kept working for
 * as long as its refresh token did. There was no way to end one from here.
 *
 * "Others" rather than "global" as the offered action: signing out of the page
 * you are standing on reads as a crash rather than a security measure.
 */
export function SessionsCard() {
  const supabase = createClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  async function signOutOthers() {
    setBusy(true);
    const { error } = await supabase.auth.signOut({ scope: "others" });
    if (error) {
      setBusy(false);
      toast("Couldn't sign out the other devices", "error");
      return;
    }

    // Every stored refresh token for every account in the switcher is dead
    // now. Leaving them would mean the switcher offers sessions that fail on
    // tap and silently drop themselves.
    try {
      localStorage.removeItem("hypefy_accounts");
    } catch {
      /* private mode — nothing was stored to begin with */
    }

    await supabase.rpc("log_security_alert", {
      p_body: "Signed out of all other devices",
    });
    setBusy(false);
    toast("Signed out everywhere else", "success");
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-elevated p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-surface text-foreground">
          <LogOut size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Sign out everywhere else</p>
          <p className="mt-0.5 text-xs leading-snug text-muted">
            Ends every other session — old phones, shared computers, anything
            you can&apos;t reach. This device stays signed in.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setConfirm(true)}
        disabled={busy}
        className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surface py-2.5 text-xs font-bold transition-colors active:bg-white/5 disabled:opacity-50"
      >
        {busy && <Loader2 size={14} className="animate-spin" />}
        {busy ? "Signing out…" : "Sign out other devices"}
      </button>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={signOutOthers}
        title="Sign out everywhere else?"
        body="Every other device will need to sign in again. Your saved accounts on this device are cleared too, since their sessions end as well."
        confirmLabel="Sign out others"
        danger
      />
    </div>
  );
}
