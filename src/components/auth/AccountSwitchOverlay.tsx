"use client";

import { Avatar } from "@/components/ui/Avatar";

/**
 * Covers the app while an account switch is in flight.
 *
 * Switching ends in a full page load — every server component was rendered
 * for the previous user, so there is no cheaper way to change identity. That
 * reload takes a moment during which nothing moves and the tap appears to
 * have been swallowed, which is what "it seems stuck" was.
 *
 * Showing who you are landing on also confirms the switch actually took the
 * account you meant, before the feed arrives to prove it.
 */
export function AccountSwitchOverlay({
  name,
  username,
  avatarUrl,
  avatarHue,
}: {
  name: string;
  username?: string | null;
  avatarUrl?: string | null;
  avatarHue?: number | null;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="animate-switch-veil fixed inset-0 z-[120] flex flex-col items-center justify-center gap-5 bg-background"
    >
      <div className="relative">
        {/* The ring is the progress signal — a spinner beside an avatar reads
            as two unrelated things happening. */}
        <span
          aria-hidden
          className="absolute -inset-2 animate-spin rounded-[28px] border-2 border-transparent border-t-accent"
          style={{ animationDuration: "900ms" }}
        />
        <Avatar
          name={name}
          hue={avatarHue ?? 200}
          src={avatarUrl ?? undefined}
          size={76}
          className="rounded-[24px]"
        />
      </div>

      <div className="text-center">
        <p className="text-base font-bold tracking-tight">{name}</p>
        {username ? <p className="text-sm text-muted">@{username}</p> : null}
        <p className="mt-3 text-xs font-semibold tracking-widest text-faint uppercase">
          Switching…
        </p>
      </div>

      <span className="absolute bottom-10 text-sm font-extrabold tracking-tight text-foreground/25">
        Hypefy<span className="text-accent">.</span>
      </span>
    </div>
  );
}
