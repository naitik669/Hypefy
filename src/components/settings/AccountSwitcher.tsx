"use client";

import { useEffect, useState } from "react";
import { Check, Plus, X, Loader2, Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";
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
  const [addOpen, setAddOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);

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

  async function addAccount() {
    if (loggingIn || !email.trim() || !password) return;
    setLoginError(null);
    setLoggingIn(true);

    // Snapshot the current session so we can restore it if login fails
    const { data: { session: prev } } = await supabase.auth.getSession();

    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });

    if (error || !data.session) {
      setLoginError(error?.message ?? "Login failed");
      setLoggingIn(false);
      // Restore current session
      if (prev) {
        await supabase.auth.setSession({
          access_token: prev.access_token,
          refresh_token: prev.refresh_token,
        });
      }
      return;
    }

    // Fetch new account's profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, display_name, username, avatar_hue, avatar_url")
      .eq("id", data.session.user.id)
      .maybeSingle();

    upsertSavedAccount({
      userId: data.session.user.id,
      email: data.session.user.email ?? "",
      displayName: (profile as any)?.display_name ?? null,
      username: (profile as any)?.username ?? null,
      avatarHue: (profile as any)?.avatar_hue ?? null,
      avatarUrl: (profile as any)?.avatar_url ?? null,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    });

    // Switch to the new account
    window.location.href = "/home";
  }

  function forget(userId: string) {
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
                  onClick={() => forget(account.userId)}
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

      {/* Add account */}
      {!addOpen ? (
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-2 rounded-2xl border border-dashed border-border px-3 py-3 text-sm text-muted transition-colors hover:border-accent/40 hover:text-foreground"
        >
          <Plus size={18} />
          Add account
        </button>
      ) : (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface px-4 py-4">
          <p className="text-sm font-semibold">Sign in to another account</p>

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="input"
            autoComplete="off"
          />

          <div className="relative">
            <input
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="input pr-10"
              onKeyDown={(e) => { if (e.key === "Enter") addAccount(); }}
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-faint"
            >
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {loginError && (
            <p className="text-xs text-danger">{loginError}</p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setAddOpen(false);
                setEmail("");
                setPassword("");
                setLoginError(null);
              }}
              className="flex-1 rounded-xl border border-border py-2.5 text-sm font-semibold transition-colors hover:bg-white/[0.04]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={addAccount}
              disabled={loggingIn || !email.trim() || !password}
              className="flex flex-1 items-center justify-center rounded-xl bg-accent py-2.5 text-sm font-bold text-accent-ink disabled:opacity-50"
            >
              {loggingIn ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                "Sign in"
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
