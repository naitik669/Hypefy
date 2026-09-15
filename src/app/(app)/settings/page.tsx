import Link from "next/link";
import { CookiePreferencesButton } from "@/components/consent/ConsentBanner";
import {
  UserCircle,
  Shield,
  ShieldCheck,
  Lock,
  Bell,
  Hash,
  Bookmark,
  Star,
  Heart,
  UserPlus,
  CalendarClock,
  HelpCircle,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { SignOutButton } from "@/components/SignOutButton";
import { AccountSwitcher } from "@/components/settings/AccountSwitcher";
import { InviteRow } from "@/components/growth/InviteButton";
import { SettingsCard, SettingsRow } from "@/components/settings/SettingsCard";
import { PremiumSettingsRow } from "@/components/billing/PremiumSettingsRow";

const ITEMS = [
  {
    href: "/settings/profile",
    label: "Edit profile",
    sub: "Photo, banner, name, bio, tags",
    icon: UserCircle,
  },
  {
    href: "/settings/style",
    label: "Your style",
    sub: "Name font, glow, avatar decoration, banners",
    icon: Sparkles,
  },
  {
    href: "/settings/account",
    label: "Account",
    sub: "Email and login",
    icon: Shield,
  },
  // Security was buried as a single toggle at the bottom of Privacy, which is
  // the wrong place for the thing that decides whether a stolen password is
  // enough to get in.
  {
    href: "/settings/security",
    label: "Security",
    sub: "Two-factor, recovery codes, devices",
    icon: ShieldCheck,
  },
  {
    href: "/settings/privacy",
    label: "Privacy",
    sub: "Who can reach you",
    icon: Lock,
  },
  {
    href: "/settings/notifications",
    label: "Notifications",
    sub: "What pings you",
    icon: Bell,
  },
  {
    href: "/settings/topics",
    label: "Topics you follow",
    sub: "Hashtags in your feed",
    icon: Hash,
  },
];

/**
 * The lists the app keeps for you. Every one of these existed as data with no
 * screen: Hypers and Favourites could be added to but never reviewed, follow
 * requests lived only in a notification you could clear, Saved was capped at
 * 30, and /create/scheduled was reachable only from inside the composer that
 * had just scheduled something.
 */
const LISTS = [
  {
    href: "/saved",
    label: "Saved",
    sub: "Posts and Shots you kept",
    icon: Bookmark,
  },
  { href: "/hypers", label: "Hypers", sub: "Your closest people", icon: Star },
  {
    href: "/favourites",
    label: "Favourites",
    sub: "People you don't want to miss",
    icon: Heart,
  },
  {
    href: "/requests",
    label: "Follow requests",
    sub: "Received and sent",
    icon: UserPlus,
  },
  {
    href: "/create/scheduled",
    label: "Scheduled posts",
    sub: "Waiting to go out",
    icon: CalendarClock,
  },
];

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [{ data: prof }, { count: joined }] = user
    ? await Promise.all([
        supabase
          .from("profiles")
          .select("username, is_admin")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("referred_by", user.id),
      ])
    : [{ data: null }, { count: 0 }];
  const username = (prof?.username as string | null) ?? null;
  const isAdmin = !!(prof as { is_admin?: boolean } | null)?.is_admin;

  return (
    <>
      <PageHeader title="Settings" showBack />

      <div className="flex flex-col gap-6 px-4 pt-2 pb-10">
        <section>
          <p className="mb-2 px-1 text-xs font-bold uppercase tracking-widest text-faint">
            Accounts
          </p>
          <AccountSwitcher />
        </section>

        <PremiumSettingsRow />

        <SettingsCard title="General">
          {ITEMS.map((item) => (
            <SettingsRow key={item.href} {...item} />
          ))}
        </SettingsCard>

        <SettingsCard title="Your lists">
          {LISTS.map((item) => (
            <SettingsRow key={item.href} {...item} />
          ))}
        </SettingsCard>

        <section>
          <p className="mb-2 px-1 text-xs font-bold uppercase tracking-widest text-faint">
            Friends
          </p>
          <InviteRow username={username} joined={joined ?? 0} />
        </section>

        <SettingsCard title="Support">
          <SettingsRow
            href="/help"
            label="Help"
            sub="What Hype, Shot and Show mean — and how to reach us"
            icon={HelpCircle}
          />
        </SettingsCard>

        {/* Moderation. The queue existed and was linked from nowhere — the only
            way in was typing the URL. The page's own notFound() gate is still
            the real check; this link is convenience, not security. */}
        {isAdmin && (
          <SettingsCard title="Moderation">
            <SettingsRow
              href="/admin/reports"
              label="Reports queue"
              sub="Review reports, remove content, suspend accounts"
              icon={ShieldAlert}
              tone="warn"
            />
          </SettingsCard>
        )}

        <SignOutButton />

        {/* Where a cookie choice is changed after the first time. The banner
            only asks once; this is the "any time" the banner promises. */}
        <CookiePreferencesButton className="mx-auto block rounded-pill border border-border px-4 py-2 text-xs font-semibold text-muted transition-colors hover:text-foreground" />

        <p className="text-center text-[11px] text-faint">
          <Link href="/terms" className="underline hover:text-muted">
            Terms of Service
          </Link>
          <span className="mx-2">·</span>
          <Link href="/privacy" className="underline hover:text-muted">
            Privacy Policy
          </Link>
          <span className="mx-2">·</span>
          <Link href="/guidelines" className="underline hover:text-muted">
            Community Guidelines
          </Link>
          <span className="mx-2">·</span>
          <Link href="/cookies" className="underline hover:text-muted">
            Cookie Policy
          </Link>
        </p>
      </div>
    </>
  );
}
