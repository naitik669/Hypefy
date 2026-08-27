"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, Plus, Check, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";
import { AuthCard } from "@/components/auth/AuthCard";
import {
  getSavedAccounts,
  removeSavedAccount,
  type SavedAccount,
} from "@/lib/saved-accounts";

/**
 * Reached via /signin?add=1 or /signup?add=1 (Settings → "Add account").
 * Distinct from the plain onboarding sign-in: shows the accounts already
 * signed into on this device first, with a "+" to go sign into/create
 * another — same shape as Instagram/Twitter's account switcher.
 * When ?add isn't set, just renders the normal AuthCard untouched.
 */
export function AccountGate({ mode }: { mode: "signin" | "signup" }) {
  const supabase = createClient();
  const [addMode, setAddMode] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [ready, setReady] = useState(false);
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isAdd = params.get("add") === "1";
    setAddMode(isAdd);
    setShowForm(params.get("view") === "form");
    if (!isAdd) { setReady(true); return; }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setCurrentUserId(session?.user.id ?? null);
      setAccounts(getSavedAccounts());
      setReady(true);
    });
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
      removeSavedAccount(account.userId);
      setAccounts(getSavedAccounts());
      setSwitching(null);
      return;
    }
    window.location.href = "/home";
  }

  function forget(userId: string) {
    removeSavedAccount(userId);
    setAccounts(getSavedAccounts());
  }

  // Not the add-account flow — untouched normal sign-in/sign-up.
  if (!ready) return null;
  if (!addMode) return <AuthCard mode={mode} />;
  if (showForm) {
    return (
      <div className="w-full max-w-[360px]">
        <button
          type="button"
          onClick={() => setShowForm(false)}
          className="mb-3 flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-foreground"
        >
          <ChevronLeft size={16} />
          Back to accounts
        </button>
        <AuthCard mode={mode} />
      </div>
    );
  }

  const name = (a: SavedAccount) => a.displayName ?? a.username ?? a.email;

  return (
    <div className="w-full max-w-[360px]">
      <div className="animate-rise relative overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04] p-7 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] backdrop-blur-2xl">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent"
        />

        <div className="flex flex-col items-center text-center">
          <span className="text-[15px] font-extrabold tracking-tight text-foreground/60">
            Hypefy<span className="text-accent">.</span>
          </span>
          <h1 className="mt-5 text-[26px] font-extrabold leading-none tracking-tight text-foreground">
            Switch account
          </h1>
          <p className="mt-2 text-[13px] text-muted">
            Pick an account or add a new one.
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-2">
          {accounts.map((account) => {
            const isCurrent = account.userId === currentUserId;
            const isSwitching = switching === account.userId;
            return (
              <div
                key={account.userId}
                className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition-colors ${
                  isCurrent ? "border-accent/30 bg-accent/[0.06]" : "border-white/10 bg-white/[0.04]"
                }`}
              >
                <Avatar name={name(account)} hue={account.avatarHue ?? 280} size={40} src={account.avatarUrl ?? undefined} />
                <div className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-semibold text-foreground">{name(account)}</p>
                  {account.username && <p className="truncate text-xs text-muted">@{account.username}</p>}
                </div>
                {isCurrent ? (
                  <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-accent">
                    <Check size={14} /> Active
                  </span>
                ) : (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => switchTo(account)}
                      disabled={!!switching}
                      className="flex h-8 min-w-[60px] items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] px-3 text-xs font-bold text-foreground transition-colors hover:border-accent/40 disabled:opacity-50"
                    >
                      {isSwitching ? <Loader2 size={12} className="animate-spin" /> : "Switch"}
                    </button>
                    <button
                      type="button"
                      onClick={() => forget(account.userId)}
                      aria-label="Remove account"
                      className="flex h-7 w-7 items-center justify-center rounded-full text-faint transition-colors hover:text-danger"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 rounded-2xl border border-dashed border-white/15 px-3 py-3 text-sm font-medium text-muted transition-colors hover:border-accent/40 hover:text-foreground"
          >
            <Plus size={18} />
            Add another account
          </button>
        </div>

        <p className="mt-6 text-center text-xs text-muted">
          <a href="/settings" className="hover:text-foreground">Done</a>
        </p>
      </div>
    </div>
  );
}
