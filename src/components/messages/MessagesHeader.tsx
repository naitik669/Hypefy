"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Plus, Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { upsertSavedAccount } from "@/lib/saved-accounts";

/**
 * Messages header: the screen title, the call log, and starting a new chat.
 *
 * It used to carry an account switcher on the title. Switching accounts is not
 * what tapping the name of the screen you are already on should do, and nothing
 * signalled that it would. Account switching lives in one place now — hold the
 * profile tab — which is also where people already look for it.
 */
export function MessagesHeader({
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

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border/60 bg-background/80 px-4 backdrop-blur-xl">
      {/* No `truncate` and no `leading-none`: together they clipped the word.
          truncate sets overflow:hidden, leading-none sets line-height to the
          font size, and "Messages" has a descender — so the tail of the g was
          cut off. The word is fixed and never needs truncating anyway. */}
      <h1 className="text-[28px] font-extrabold leading-tight tracking-tight">
        Messages
      </h1>

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
