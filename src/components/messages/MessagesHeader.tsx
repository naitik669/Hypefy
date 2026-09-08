"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, Plus, Check, Loader2, Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";
import { getSavedAccounts, upsertSavedAccount, removeSavedAccount, type SavedAccount } from "@/lib/saved-accounts";

/**
 * Messages header: shows the active account's username with a chevron that
 * opens an account-switcher dropdown (other saved logins), Instagram-DM style.
 */
export function MessagesHeader({
  currentUserId,
  name,
  username,
  avatarUrl,
  hue,
}: {
  currentUserId: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  hue: number;
}) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  const [switching, setSwitching] = useState<string | null>(null);

  // Persist the active session so it appears in the switcher with fresh tokens.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        upsertSavedAccount({
          userId: session.user.id,
          email: session.user.email ?? "",
          displayName: name,
          username,
          avatarHue: hue,
          avatarUrl,
          accessToken: session.access_token,
          refreshToken: session.refresh_token,
        });
      }
      setAccounts(getSavedAccounts());
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function switchTo(acct: SavedAccount) {
    if (acct.userId === currentUserId || switching) return;
    setSwitching(acct.userId);
    const { error } = await supabase.auth.setSession({
      access_token: acct.accessToken,
      refresh_token: acct.refreshToken,
    });
    if (error) {
      removeSavedAccount(acct.userId);
      setAccounts(getSavedAccounts());
      setSwitching(null);
      return;
    }
    window.location.href = "/messages";
  }

  const others = accounts.filter((a) => a.userId !== currentUserId);

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border/60 bg-background/80 px-4 backdrop-blur-xl">
      {/* "Messages" as a large title, per the reference.
          The chevron is the one addition: the account switcher was asked for
          before the reference arrived, and the reference has no place for it,
          so it hangs off the title rather than being dropped. Tap the word to
          switch accounts; if that is unwanted, this button becomes an <h1>. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-w-0 items-center gap-1"
        aria-haspopup="menu"
        aria-expanded={open}
        title={username ? `Signed in as @${username}` : name}
      >
        <h1 className="truncate text-[28px] font-extrabold leading-none tracking-tight">
          Messages
        </h1>
        <ChevronDown
          size={20}
          className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      <div className="flex shrink-0 items-center gap-1.5">
        {/* Call log was previously reachable only by tapping a call
            notification — invisible once that notification was cleared. */}
        <Link
          href="/calls"
          aria-label="Call history"
          className="flex h-10 w-10 items-center justify-center rounded-full text-foreground transition-colors hover:bg-white/5"
        >
          <Phone size={21} />
        </Link>

        {/* Squircle, not a circle: it is the same shape language as the
            create button in the bottom nav, so the app's two "make something
            new" affordances read as the same control. */}
        <Link
          href="/messages/new"
          aria-label="New message"
          className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-accent text-accent-ink shadow-md transition-transform active:scale-90"
        >
          <Plus size={22} strokeWidth={2.75} />
        </Link>
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            style={{ transformOrigin: "top left" }}
            className="animate-menu-pop absolute left-4 top-[60px] z-40 w-72 overflow-hidden rounded-2xl border border-border bg-elevated py-1 shadow-2xl"
          >
            <p className="px-4 pb-1 pt-2 text-[11px] font-bold uppercase tracking-widest text-faint">Switch account</p>

            {accounts.map((acct) => {
              const isCurrent = acct.userId === currentUserId;
              const label = acct.displayName ?? acct.username ?? acct.email;
              return (
                <button
                  key={acct.userId}
                  type="button"
                  onClick={() => (isCurrent ? setOpen(false) : switchTo(acct))}
                  disabled={!!switching}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-white/5 disabled:opacity-60"
                >
                  <Avatar name={label} hue={acct.avatarHue ?? 280} size={36} src={acct.avatarUrl ?? undefined} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{label}</p>
                    {acct.username && <p className="truncate text-xs text-muted">@{acct.username}</p>}
                  </div>
                  {isCurrent ? (
                    <Check size={16} className="shrink-0 text-accent" />
                  ) : switching === acct.userId ? (
                    <Loader2 size={15} className="shrink-0 animate-spin text-muted" />
                  ) : null}
                </button>
              );
            })}

            <Link
              href="/signin?add=1"
              onClick={() => setOpen(false)}
              className="mt-1 flex items-center gap-3 border-t border-border/60 px-3 py-2.5 text-sm text-muted hover:bg-white/5 hover:text-foreground"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-border">
                <Plus size={16} />
              </span>
              Add account
            </Link>
          </div>
        </>
      )}
    </header>
  );
}
