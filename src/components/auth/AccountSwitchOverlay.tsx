"use client";

import { createPortal } from "react-dom";
import { Avatar } from "@/components/ui/Avatar";

/**
 * Covers the app while an account switch is in flight.
 *
 * PORTALLED TO BODY, and that is not optional. The trigger lives inside the
 * bottom nav, which carries `backdrop-blur-xl`; a backdrop-filter creates a
 * containing block, so `position: fixed` inside it resolves against the
 * 72px nav bar rather than the viewport. Rendered in place, this "fullscreen"
 * overlay was a sliver behind the tab bar.
 *
 * Paced as a flash rather than a wait. The reload behind it takes roughly a
 * third of a second, so the mark pops in at 260ms and a single accent line
 * sweeps underneath — enough to show the switch was heard and which account
 * it took, without pretending to be a long operation.
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
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-background"
    >
      <div className="animate-switch-pop flex flex-col items-center">
        <Avatar
          name={name}
          hue={avatarHue ?? 200}
          src={avatarUrl ?? undefined}
          size={88}
          className="rounded-[28px] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.9)] ring-2 ring-white/10"
        />

        <p className="mt-5 text-lg font-extrabold tracking-tight">{name}</p>
        {username ? (
          <p className="mt-0.5 text-sm text-muted">@{username}</p>
        ) : null}

        {/* One sweeping line. A spinner beside an avatar reads as two
            unrelated things happening at once. */}
        <div className="mt-6 h-[3px] w-32 overflow-hidden rounded-full bg-white/8">
          <div className="animate-switch-sweep h-full w-full rounded-full bg-accent" />
        </div>
      </div>

      <span className="absolute bottom-12 text-sm font-extrabold tracking-tight text-foreground/20">
        Hypefy<span className="text-accent">.</span>
      </span>
    </div>,
    document.body
  );
}
