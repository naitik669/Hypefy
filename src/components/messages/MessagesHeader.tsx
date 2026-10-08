"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Plus, Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { upsertSavedAccount } from "@/lib/saved-accounts";
import { AccountDropdown } from "@/components/messages/AccountDropdown";

/**
 * Messages header: the screen title, the call log, and starting a new chat.
 *
 * The title carries the account switcher again. It was taken out once because
 * nothing signalled that tapping the name of the screen you are already on
 * would change who you are — so this time it is a word with an arrow beside
 * it, which is a control rather than a title that secretly does something.
 * Holding the profile tab still works and reads from the same list.
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

  // Keeps this session in the saved-accounts list with fresh tokens. The
  // switcher moved to the profile tab, but it reads from that list, so the
  // refresh has to keep happening somewhere the signed-in user actually goes.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
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
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // No border and no separate tint. The reference reads as one clean surface —
  // title, search and pills all on the same ground — and a rule under the title
  // chopped the screen into "chrome" and "content" for no reason. Still sticky,
  // but painted in the page's own colour so it never announces itself; the list
  // simply slides under it.
  return (
    <header className="sticky top-0 z-20 flex h-[calc(4rem+var(--sat))] items-center justify-between bg-background px-4 pt-[var(--sat)]">
      {/* No truncate and no leading-none on the word: together they clipped
          it, because "Messages" has a descender. It is fixed and never needs
          truncating anyway. */}
      <AccountDropdown currentUserId={currentUserId} title="Messages" />

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

        {/* Squircle, not a circle: the same shape language as the create button
            in the bottom nav, so the app's two "make something new" controls
            read as the same control. */}
        <Link
          href="/messages/new"
          aria-label="New message"
          className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-accent text-accent-ink shadow-md transition-transform active:scale-90"
        >
          <Plus size={22} strokeWidth={2.75} />
        </Link>
      </div>
    </header>
  );
}
