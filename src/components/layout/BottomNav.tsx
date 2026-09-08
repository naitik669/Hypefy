"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { House, Chat, Lightning, Plus } from "@phosphor-icons/react";
import { Avatar } from "@/components/ui/Avatar";
import { AccountSwitchPad } from "@/components/layout/AccountSwitchPad";
import { createClient } from "@/lib/supabase/client";
import { haptics } from "@/lib/haptics";
import { NavHoldMenu, type HoldAction } from "@/components/layout/NavHoldMenu";
import { ChatHoldMenu } from "@/components/layout/ChatHoldMenu";
import { Search, Settings, Bookmark, Bell } from "lucide-react";

/**
 * Shortcuts behind a hold on Home.
 *
 * Search first because it is the reason this exists: it had no icon
 * anywhere, then briefly had one wedged beside the wordmark, which read as
 * clutter. Ordered nearest-thumb-first: NavHoldMenu renders the stack in
 * reverse, so the first entry here is the one closest to the finger.
 */
const HOME_SHORTCUTS: HoldAction[] = [
  { icon: Search, label: "Search", href: "/search" },
  { icon: Bell, label: "Activity", href: "/notifications" },
  { icon: Bookmark, label: "Saved", href: "/saved" },
  // Discover was here and came out: it has the compass in the top bar AND a
  // right-swipe from the feed, so it was the one entry with two other ways in.
  // Settings had none — it was buried behind the profile tab.
  { icon: Settings, label: "Settings", href: "/settings" },
];

export function BottomNav({
  avatarUrl,
  avatarHue,
  displayName,
  currentUserId,
  initialUnreadMsgs = 0,
}: {
  avatarUrl: string | null | undefined;
  avatarHue: number;
  displayName: string;
  currentUserId: string;
  initialUnreadMsgs?: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [unreadMsgs, setUnreadMsgs] = useState(initialUnreadMsgs);
  const profileActive = pathname.startsWith("/profile");
  const messagesActive = pathname.startsWith("/messages");

  // Clear badge immediately when viewing /messages
  useEffect(() => {
    if (messagesActive) setUnreadMsgs(0);
  }, [messagesActive]);

  // Realtime: bump count on incoming messages, clear when I mark as read
  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel(`bottomnav-msgs:${currentUserId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (p) => {
          const m = p.new as { sender_id: string };
          if (m.sender_id !== currentUserId && !messagesActive) {
            setUnreadMsgs((n) => n + 1);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversation_members",
          filter: `user_id=eq.${currentUserId}`,
        },
        (p) => {
          // When last_read_at updates (opened a thread), decrement by 1
          const m = p.new as { last_read_at: string | null };
          if (m.last_read_at) setUnreadMsgs((n) => Math.max(0, n - 1));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto flex h-[72px] w-full max-w-[480px] items-center justify-around border-t border-border/60 bg-background/85 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
        {/* Tap goes home; holding raises the shortcuts. Search lives here
            rather than as a second icon in the top bar, where it crowded the
            wordmark and looked bolted on. */}
        <NavHoldMenu actions={HOME_SHORTCUTS} label="Home shortcuts">
          <NavItem
            href="/home"
            label="Home"
            Icon={House}
            active={pathname.startsWith("/home")}
          />
        </NavHoldMenu>

        {/* Messages with live unread badge. Holding raises the last few
            conversations — the third tab to use the gesture, so the whole nav
            bar now answers a hold with "where do you actually want to go". */}
        <ChatHoldMenu currentUserId={currentUserId}>
          <Link
            href="/messages"
            aria-label="Messages"
            onClick={() => haptics.tap()}
            className={`relative flex h-12 w-12 flex-col items-center justify-center gap-1 transition-[color,transform] duration-200 active:scale-90 ${
              messagesActive ? "text-foreground" : "text-faint hover:text-muted"
            }`}
          >
            {/* A speech bubble, not a paper plane: the plane reads as "send",
              which is one action inside a thread rather than the inbox itself.
              Plain Chat rather than a dotted variant — dots inside the bubble
              compete with the count sitting on its corner.

              The badge is positioned against this span, not the whole tab, so
              it lands on the bubble's corner instead of floating in the
              padding above it. */}
            <span className="relative flex items-center justify-center">
              <Chat
                size={26}
                weight={messagesActive ? "fill" : "regular"}
                className={`transition-transform duration-300 ${
                  messagesActive ? "-translate-y-0.5 scale-105" : ""
                }`}
              />
              {unreadMsgs > 0 && !messagesActive && (
                // Red, not accent: a count you have not read is an alert, and
                // the accent green is the same colour as the active-tab dot
                // right below it. The background-coloured ring cuts the bubble's
                // stroke away behind the badge so the two shapes stay readable
                // where they overlap.
                <span className="absolute -right-2 -top-1.5 flex h-[18px] min-w-[18px] animate-react-pop items-center justify-center rounded-full bg-danger px-1 text-[10px] font-black leading-none text-white ring-[3px] ring-background">
                  {unreadMsgs > 9 ? "9+" : unreadMsgs}
                </span>
              )}
            </span>
            <NavDot active={messagesActive} />
          </Link>
        </ChatHoldMenu>

        {/* center create */}
        <button
          type="button"
          aria-label="Create"
          onClick={() => {
            haptics.tap();
            router.push("/create");
          }}
          className="flex h-11 w-[68px] -translate-y-1.5 items-center justify-center rounded-[20px] bg-accent text-accent-ink shadow-md transition-transform duration-200 will-change-transform hover:brightness-105 active:scale-90"
        >
          <span className="flex items-center justify-center">
            <Plus size={26} weight="bold" aria-hidden />
          </span>
        </button>

        <NavItem
          href="/shots"
          label="Shots"
          Icon={Lightning}
          active={pathname.startsWith("/shots")}
        />

        {/* Tap goes to the profile as always; holding raises the account
            switcher and the thumb picks from it without lifting. */}
        <AccountSwitchPad currentUserId={currentUserId}>
          <Link
            href="/profile"
            aria-label="Profile"
            onClick={() => haptics.tap()}
            className="flex h-12 w-12 flex-col items-center justify-center gap-1 transition-transform duration-200 active:scale-90"
          >
            <Avatar
              name={displayName}
              hue={avatarHue}
              src={avatarUrl ?? undefined}
              size={28}
              className={`rounded-[9px] transition-all duration-300 ${
                profileActive
                  ? "-translate-y-0.5 scale-105 opacity-100 brightness-100 ring-2 ring-accent/70"
                  : "opacity-80 brightness-90"
              }`}
            />
            <NavDot active={profileActive} />
          </Link>
        </AccountSwitchPad>
      </nav>
    </>
  );
}

type PhosphorIcon = typeof House;

function NavItem({
  href,
  label,
  Icon,
  active,
}: {
  href: string;
  label: string;
  Icon: PhosphorIcon;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      onClick={() => haptics.tap()}
      className={`flex h-12 w-12 flex-col items-center justify-center gap-1 transition-[color,transform] duration-200 active:scale-90 ${
        active ? "text-foreground" : "text-faint hover:text-muted"
      }`}
    >
      <Icon
        size={26}
        weight={active ? "fill" : "regular"}
        className={`transition-transform duration-300 ${
          active ? "-translate-y-0.5 scale-105" : ""
        }`}
      />
      <NavDot active={active} />
    </Link>
  );
}

/** Active indicator — a tiny dot that grows into a short accent pill. */
function NavDot({ active }: { active: boolean }) {
  return (
    <span
      className={`h-1 rounded-full transition-all duration-300 ${
        active ? "w-4 bg-accent" : "w-1 bg-transparent"
      }`}
    />
  );
}
