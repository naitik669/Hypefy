import Link from "next/link";
import {
  ChevronRight,
  UserCircle,
  Shield,
  Lock,
  Bell,
  Hash,
  Bookmark,
  Star,
  Heart,
  UserPlus,
  CalendarClock,
  HelpCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { SignOutButton } from "@/components/SignOutButton";
import { AccountSwitcher } from "@/components/settings/AccountSwitcher";
import { InviteRow } from "@/components/growth/InviteButton";

const ITEMS = [
  { href: "/settings/profile", label: "Edit profile", sub: "Photo, banner, name, bio, tags", icon: UserCircle },
  { href: "/settings/account", label: "Account", sub: "Email and login", icon: Shield },
  { href: "/settings/privacy", label: "Privacy", sub: "Who can reach you", icon: Lock },
  { href: "/settings/notifications", label: "Notifications", sub: "What pings you", icon: Bell },
  { href: "/settings/topics", label: "Topics you follow", sub: "Hashtags in your feed", icon: Hash },
];

/**
 * The lists the app keeps for you. Every one of these existed as data with no
 * screen: Hypers and Favourites could be added to but never reviewed, follow
 * requests lived only in a notification you could clear, Saved was capped at
 * 30, and /create/scheduled was reachable only from inside the composer that
 * had just scheduled something.
 */
const LISTS = [
  { href: "/saved", label: "Saved", sub: "Posts and Shots you kept", icon: Bookmark },
  { href: "/hypers", label: "Hypers", sub: "Your closest people", icon: Star },
  { href: "/favourites", label: "Favourites", sub: "People you don't want to miss", icon: Heart },
  { href: "/requests", label: "Follow requests", sub: "Received and sent", icon: UserPlus },
  { href: "/create/scheduled", label: "Scheduled posts", sub: "Waiting to go out", icon: CalendarClock },
];

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: prof }, { count: joined }] = user
    ? await Promise.all([
        supabase.from("profiles").select("username").eq("id", user.id).maybeSingle(),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("referred_by", user.id),
      ])
    : [{ data: null }, { count: 0 }];
  const username = (prof?.username as string | null) ?? null;

  return (
    <>
      <PageHeader title="Settings" showBack />

      <div className="flex flex-col gap-6 px-4 pt-2 pb-10">
        {/* Accounts */}
        <section>
          <p className="mb-2 px-1 text-xs font-bold uppercase tracking-widest text-faint">
            Accounts
          </p>
          <AccountSwitcher />
        </section>

        {/* General settings */}
        <section>
          <p className="mb-1 px-1 text-xs font-bold uppercase tracking-widest text-faint">
            General
          </p>
          <div className="flex flex-col">
            {ITEMS.map(({ href, label, sub, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-3 rounded-2xl px-2 py-4 transition-colors hover:bg-white/[0.03]"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-foreground">
                  <Icon size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{label}</p>
                  <p className="truncate text-xs text-muted">{sub}</p>
                </div>
                <ChevronRight size={18} className="shrink-0 text-faint" />
              </Link>
            ))}
          </div>
        </section>

        {/* Your lists */}
        <section>
          <p className="mb-1 px-1 text-xs font-bold uppercase tracking-widest text-faint">
            Your lists
          </p>
          <div className="flex flex-col">
            {LISTS.map(({ href, label, sub, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-3 rounded-2xl px-2 py-4 transition-colors hover:bg-white/[0.03]"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-foreground">
                  <Icon size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{label}</p>
                  <p className="truncate text-xs text-muted">{sub}</p>
                </div>
                <ChevronRight size={18} className="shrink-0 text-faint" />
              </Link>
            ))}
          </div>
        </section>

        {/* Grow the circle */}
        <section>
          <p className="mb-1 px-1 text-xs font-bold uppercase tracking-widest text-faint">
            Friends
          </p>
          <InviteRow username={username} joined={joined ?? 0} />
        </section>

        {/* Help */}
        <section>
          <p className="mb-1 px-1 text-xs font-bold uppercase tracking-widest text-faint">
            Support
          </p>
          <Link
            href="/help"
            className="flex items-center gap-3 rounded-2xl px-2 py-4 transition-colors hover:bg-white/[0.03]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-foreground">
              <HelpCircle size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Help</p>
              <p className="truncate text-xs text-muted">
                What Hype, Shot and Show mean — and how to reach us
              </p>
            </div>
            <ChevronRight size={18} className="shrink-0 text-faint" />
          </Link>
        </section>

        {/* Sign out */}
        <SignOutButton />

        {/* Legal footer */}
        <p className="text-center text-[11px] text-faint">
          <Link href="/terms" className="underline hover:text-muted">Terms of Service</Link>
          <span className="mx-2">·</span>
          <Link href="/privacy" className="underline hover:text-muted">Privacy Policy</Link>
          <span className="mx-2">·</span>
          <Link href="/guidelines" className="underline hover:text-muted">Community Guidelines</Link>
        </p>
      </div>
    </>
  );
}
