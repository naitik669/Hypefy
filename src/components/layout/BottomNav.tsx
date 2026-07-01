"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, PaperPlaneTilt, Lightning, Plus, X } from "@phosphor-icons/react";
import { CreateSheet } from "@/components/create/CreateSheet";
import { Avatar } from "@/components/ui/Avatar";
import { createClient } from "@/lib/supabase/client";

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
  const [createOpen, setCreateOpen] = useState(false);
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
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (p) => {
        const m = p.new as { sender_id: string };
        if (m.sender_id !== currentUserId && !messagesActive) {
          setUnreadMsgs((n) => n + 1);
        }
      })
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "conversation_members",
        filter: `user_id=eq.${currentUserId}`,
      }, (p) => {
        // When last_read_at updates (opened a thread), decrement by 1
        const m = p.new as { last_read_at: string | null };
        if (m.last_read_at) setUnreadMsgs((n) => Math.max(0, n - 1));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto flex h-[72px] w-full max-w-[480px] items-center justify-around border-t border-border/60 bg-background/85 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
        <NavItem href="/home" label="Home" Icon={House} active={pathname.startsWith("/home")} />

        {/* Messages with live unread badge */}
        <Link
          href="/messages"
          aria-label="Messages"
          className={`relative flex h-12 w-12 flex-col items-center justify-center gap-1 transition-[color,transform] duration-200 active:scale-90 ${
            messagesActive ? "text-foreground" : "text-faint hover:text-muted"
          }`}
        >
          <PaperPlaneTilt
            size={26}
            weight={messagesActive ? "fill" : "regular"}
            className={`transition-transform duration-300 ${messagesActive ? "-translate-y-0.5 scale-105" : ""}`}
          />
          {unreadMsgs > 0 && !messagesActive && (
            <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 animate-react-pop items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold text-accent-ink ring-2 ring-background">
              {unreadMsgs > 9 ? "9+" : unreadMsgs}
            </span>
          )}
          <NavDot active={messagesActive} />
        </Link>

        {/* center create */}
        <button
          type="button"
          aria-label={createOpen ? "Close" : "Create"}
          onClick={() => setCreateOpen((v) => !v)}
          className="flex h-11 w-[68px] -translate-y-1.5 items-center justify-center rounded-[20px] bg-accent text-accent-ink shadow-md transition-transform duration-200 will-change-transform hover:brightness-105 active:scale-90"
        >
          <span
            className="flex items-center justify-center transition-transform duration-300"
            style={{ transform: createOpen ? "rotate(90deg)" : "rotate(0deg)" }}
          >
            {createOpen ? <X size={24} weight="bold" aria-hidden /> : <Plus size={26} weight="bold" aria-hidden />}
          </span>
        </button>

        <NavItem href="/shots" label="Shots" Icon={Lightning} active={pathname.startsWith("/shots")} />

        <Link
          href="/profile"
          aria-label="Profile"
          className="flex h-12 w-12 flex-col items-center justify-center gap-1 transition-transform duration-200 active:scale-90"
        >
          <Avatar
            name={displayName}
            hue={avatarHue}
            src={avatarUrl ?? undefined}
            size={28}
            className={`rounded-[9px] transition-all duration-300 ${profileActive ? "-translate-y-0.5 scale-105 opacity-100 brightness-100 ring-2 ring-accent/70" : "opacity-80 brightness-90"}`}
          />
          <NavDot active={profileActive} />
        </Link>
      </nav>

      <CreateSheet open={createOpen} onClose={() => setCreateOpen(false)} />
    </>
  );
}

type PhosphorIcon = typeof House;

function NavItem({ href, label, Icon, active }: { href: string; label: string; Icon: PhosphorIcon; active: boolean }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={`flex h-12 w-12 flex-col items-center justify-center gap-1 transition-[color,transform] duration-200 active:scale-90 ${active ? "text-foreground" : "text-faint hover:text-muted"}`}
    >
      <Icon
        size={26}
        weight={active ? "fill" : "regular"}
        className={`transition-transform duration-300 ${active ? "-translate-y-0.5 scale-105" : ""}`}
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
