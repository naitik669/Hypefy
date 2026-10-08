"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Chat } from "@phosphor-icons/react";
import { Check, ChevronDown, Loader2, Plus, Star } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { FloatingMenu } from "@/components/ui/FloatingMenu";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/ToastProvider";
import { haptics } from "@/lib/haptics";
import { getSavedAccounts, removeSavedAccount, type SavedAccount } from "@/lib/saved-accounts";
import { hasAny, unreadForAll, type UnreadResult } from "@/lib/account-unread";

/**
 * The Messages title, with the other accounts on this device behind it.
 *
 * The title carried a switcher once before and it was taken out, because
 * tapping the name of the screen you are already on is not a thing anyone
 * expects to change who they are. The arrow is what fixes that: it says
 * there is something behind the word, which is the whole of the old
 * objection. Holding the profile tab still works, and still reads from the
 * same list.
 *
 * Counts are asked for when the panel opens, not when the page loads. Every
 * other account costs its own round trip, signed in as that person, and
 * paying that on every visit to Messages to fill in numbers nobody has asked
 * to see would be the wrong trade.
 */
export function AccountDropdown({
  currentUserId,
  title,
}: {
  currentUserId: string;
  title: string;
}) {
  const router = useRouter();
  const showToast = useToast();
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  const [counts, setCounts] = useState<Record<string, UnreadResult>>({});
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  function close() {
    setOpen(false);
  }

  /**
   * Open it, and go and find what is waiting on the other accounts.
   *
   * Done here rather than in an effect on `open`: the list lives in
   * localStorage, which only exists once there is a browser and a tap, and
   * an effect that sets state the moment it runs is a render for nothing.
   */
  function toggle() {
    haptics.tap();
    if (open) {
      close();
      return;
    }
    const list = getSavedAccounts();
    setAccounts(list);
    setOpen(true);

    const others = list.filter((a) => a.userId !== currentUserId);
    if (others.length === 0) return;
    setLoading(true);
    void unreadForAll(others).then((found) => {
      setCounts(found);
      setLoading(false);
    });
  }

  async function switchTo(account: SavedAccount) {
    if (switching) return;
    setSwitching(account.userId);
    const { error } = await createClient().auth.setSession({
      access_token: account.accessToken,
      refresh_token: account.refreshToken,
    });
    if (error) {
      // A refresh token expires. Drop the dead entry rather than leaving a
      // row that does nothing every time it is tapped.
      removeSavedAccount(account.userId);
      setAccounts(getSavedAccounts());
      setSwitching(null);
      showToast("That account needs signing in to again.");
      return;
    }
    // A full load, not a route change: everything on screen belongs to the
    // person who just stopped being signed in.
    window.location.assign("/messages");
  }

  const others = accounts.filter((a) => a.userId !== currentUserId);
  const mine = accounts.find((a) => a.userId === currentUserId);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${title}. Switch account`}
        data-account-dropdown
        className="flex items-center gap-1.5 text-[28px] font-extrabold leading-tight tracking-tight"
      >
        {title}
        <ChevronDown
          size={20}
          strokeWidth={3}
          aria-hidden
          className={`mt-1 shrink-0 text-muted transition-transform duration-200 ${open ? "rotate-180 text-accent" : ""}`}
        />
      </button>

      {/* While this is open the rest of the screen is out of play.
          FloatingMenu lays its own catcher underneath, but that one closes on
          pointerdown and then unmounts — so the click that follows lands on
          whatever was beneath it, and tapping a conversation to dismiss the
          panel would close it AND open that chat. This sits above that
          catcher, takes both halves of the tap, and is dark enough to say
          the thread list is not listening. */}
      {open &&
        createPortal(
          <div
            data-account-scrim
            aria-hidden
            onPointerDown={(e) => e.stopPropagation()}
            onClick={close}
            className="animate-scrim-in fixed inset-0 z-[195] bg-black/45"
          />,
          document.body,
        )}

      <FloatingMenu
        open={open}
        onClose={close}
        origin="top-left"
        className="absolute left-0 top-11 w-[17rem]"
      >
        {mine && <Row account={mine} current onPick={close} />}
        {others.map((a) => (
          <Row
            key={a.userId}
            account={a}
            unread={counts[a.userId]}
            loading={loading && !(a.userId in counts)}
            busy={switching === a.userId}
            onPick={() => void switchTo(a)}
          />
        ))}
        <button
          type="button"
          onClick={() => {
            close();
            router.push("/signin?add=1");
          }}
          className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <Plus size={18} strokeWidth={2.6} />
          </span>
          <span className="text-sm font-semibold text-accent">Add account</span>
        </button>
      </FloatingMenu>
    </div>
  );
}

function Row({
  account,
  current = false,
  unread,
  loading = false,
  busy = false,
  onPick,
}: {
  account: SavedAccount;
  current?: boolean;
  unread?: UnreadResult;
  loading?: boolean;
  busy?: boolean;
  onPick: () => void;
}) {
  const name = account.displayName ?? account.username ?? "You";
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={busy}
      data-account-row={account.userId}
      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors disabled:opacity-60 ${
        current ? "bg-accent/10" : "hover:bg-white/[0.04]"
      }`}
    >
      <Avatar name={name} hue={account.avatarHue ?? 280} src={account.avatarUrl ?? undefined} size={36} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{name}</span>
        {hasAny(unread) ? (
          <span className="mt-0.5 flex items-center gap-2.5 text-[11px] font-bold text-accent">
            {unread.chats > 0 && (
              <span className="flex items-center gap-1" aria-label={`${unread.chats} unread chats`}>
                <Chat size={13} aria-hidden />
                {unread.chats}
              </span>
            )}
            {unread.activity > 0 && (
              <span className="flex items-center gap-1" aria-label={`${unread.activity} new activity`}>
                <Star size={12} strokeWidth={2.4} aria-hidden />
                {unread.activity}
              </span>
            )}
          </span>
        ) : (
          <span className="block truncate text-xs text-muted">
            {account.username ? `@${account.username}` : account.email}
          </span>
        )}
      </span>
      {busy ? (
        <Loader2 size={16} className="shrink-0 animate-spin text-muted" />
      ) : current ? (
        <Check size={16} className="shrink-0 text-accent" />
      ) : loading ? (
        // Its numbers are still coming. A quiet dot, not a spinner per row.
        <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-faint" aria-hidden />
      ) : null}
    </button>
  );
}
