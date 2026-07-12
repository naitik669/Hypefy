import Link from "next/link";
import { ChevronRight, UserCircle, Shield, Lock, Bell, Hash } from "lucide-react";
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

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: prof } = user
    ? await supabase.from("profiles").select("username").eq("id", user.id).maybeSingle()
    : { data: null };
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

        {/* Grow the circle */}
        <section>
          <p className="mb-1 px-1 text-xs font-bold uppercase tracking-widest text-faint">
            Friends
          </p>
          <InviteRow username={username} />
        </section>

        {/* Sign out */}
        <SignOutButton />

        {/* Legal footer */}
        <p className="text-center text-[11px] text-faint">
          <Link href="/terms" className="underline hover:text-muted">Terms of Service</Link>
          <span className="mx-2">·</span>
          <Link href="/privacy" className="underline hover:text-muted">Privacy Policy</Link>
        </p>
      </div>
    </>
  );
}
