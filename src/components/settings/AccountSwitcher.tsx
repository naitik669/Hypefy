"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Plus, X, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  getSavedAccounts,
  upsertSavedAccount,
  removeSavedAccount,
  type SavedAccount,
} from "@/lib/saved-accounts";

export function AccountSwitcher() {
  const supabase = createClient();
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const [confirmForget, setConfirmForget] = useState<SavedAccount | null>(null);

  // On mount: save current session into localStorage so it shows in the list
  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

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

      setCurrentUserId(session.user.id);
      setAccounts(getSavedAccounts());
    }
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function switchTo(account: SavedAccount) {
    if (account.userId === currentUserId || switching) return;
    setSwitching(account.userId);
    const { error } = await supabase.auth.setSession({
      access_token: account.accessToken,
      refresh_token: account.refreshToken,
    });
    if (error) {
      // Tokens expired — drop this account and show feedback
      removeSavedAccount(account.userId);
      setAccounts(getSavedAccounts());
      setSwitching(null);
      return;
    }
    window.location.href = "/home";
  }

  function forget(userId: string) {
    setConfirmForget(null);
    removeSavedAccount(userId);
    setAccounts(getSavedAccounts());
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Saved accounts list */}
      {accounts.map((account) => {
        const isCurrent = account.userId === currentUserId;
        const name = account.displayName ?? account.username ?? account.email;
        const isSwitching = switching === account.userId;

        return (
          <div
            key={account.userId}
            className={`flex items-center gap-3 rounded-2xl border px-3 py-3 transition-colors ${
              isCurrent ? "border-accent/30 bg-accent/[0.06]" : "border-border bg-surface"
            }`}
          >
            <Avatar
              name={name}
              hue={account.avatarHue ?? 280}
              size={44}
              src={account.avatarUrl ?? undefined}
            />

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{name}</p>
              {account.username && (
                <p className="truncate text-xs text-muted">@{account.username}</p>
              )}
              {isCurrent && (
                <p className="text-[10px] font-bold uppercase tracking-widest text-accent">
                  Active
                </p>
              )}
            </div>

            {isCurrent ? (
              <Check size={18} className="shrink-0 text-accent" />
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => switchTo(account)}
                  disabled={!!switching}
                  className="flex h-8 min-w-[60px] items-center justify-center rounded-xl border border-border bg-elevated px-3 text-xs font-bold transition-colors hover:border-accent/40 disabled:opacity-50"
                >
                  {isSwitching ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    "Switch"
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmForget(account)}
                  aria-label="Remove account"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-faint transition-colors hover:bg-danger/10 hover:text-danger"
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* Add account — routes through the real sign-in/sign-up flow, same
          as other apps, instead of a cramped inline form */}
      <Link
        href="/signin?add=1"
        className="flex items-center gap-2 rounded-2xl border border-dashed border-border px-3 py-3 text-sm text-muted transition-colors hover:border-accent/40 hover:text-foreground"
      >
        <Plus size={18} />
        Add account
      </Link>

      {/* The × sits a few pixels from "Switch" and used to fire on the first
          tap. Getting the account back means signing in with the password
          again, which is the whole thing this list exists to avoid. */}
      <ConfirmDialog
        open={confirmForget !== null}
        onClose={() => setConfirmForget(null)}
        onConfirm={() => {
          if (confirmForget) forget(confirmForget.userId);
        }}
        icon={X}
        title={`Forget ${confirmForget?.displayName ?? (confirmForget?.username ? "@" + confirmForget.username : "this account")}?`}
        body="It goes from this device's quick-switch list. The account itself is untouched — you'll just need the password to add it back."
        confirmLabel="Forget"
      />
    </div>
  );
}
