"use client";

import { useState } from "react";
import { Check, UserPlus, ChevronRight } from "lucide-react";
import { Plane } from "@/components/ui/Plane";
import { haptics } from "@/lib/haptics";

const SITE = "https://app.hypefy.chat";

/** Native-share (clipboard fallback) of the user's profile link.
 *  Carries ?ref=<username> so signups from it credit the inviter. */
export async function shareProfile(username: string | null) {
  haptics.tap();
  // No username means no ?ref, which means the invite is uncredited — while
  // the row above it is still counting "friends joined from your link". Send
  // people to pick a handle first rather than quietly losing the referral.
  const url = username
    ? `${SITE}/u/${username}?ref=${encodeURIComponent(username)}`
    : `${SITE}/setup-profile`;
  const text = "Come find me on Hypefy, where your personality lives.";
  try {
    if (navigator.share) {
      await navigator.share({ url, text });
      return "shared";
    }
  } catch {
    /* user dismissed the sheet — fall through to nothing */
    return "dismissed";
  }
  await navigator.clipboard.writeText(url).catch(() => {});
  return "copied";
}

/** Square icon button for the profile-header action row. */
export function InviteIconButton({ username }: { username: string | null }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label="Share profile"
      onClick={async () => {
        if ((await shareProfile(username)) === "copied") {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }
      }}
      className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-elevated text-foreground transition-colors hover:bg-elevated/70 active:scale-[0.99]"
    >
      {copied ? (
        <Check size={18} className="text-accent" />
      ) : (
        <Plane size={18} weight="bold" />
      )}
    </button>
  );
}

/** Full-width row for the settings hub, styled like its nav links. */
export function InviteRow({
  username,
  joined = 0,
}: {
  username: string | null;
  joined?: number;
}) {
  const [copied, setCopied] = useState(false);
  const sub = copied
    ? "Link copied ✓"
    : joined > 0
    ? `${joined} ${
        joined === 1 ? "friend" : "friends"
      } joined from your link 🎉`
    : "Share your profile link";
  return (
    <button
      type="button"
      onClick={async () => {
        if ((await shareProfile(username)) === "copied") {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }
      }}
      className="flex w-full items-center gap-3 rounded-2xl px-2 py-4 text-left transition-colors hover:bg-white/[0.03]"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
        <UserPlus size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Invite friends</p>
        <p className="truncate text-xs text-muted">{sub}</p>
      </div>
      <ChevronRight size={18} className="shrink-0 text-faint" />
    </button>
  );
}
