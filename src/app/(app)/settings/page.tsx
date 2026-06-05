import Link from "next/link";
import { ChevronRight, UserCircle, Shield, Lock, Bell } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { SignOutButton } from "@/components/SignOutButton";

const ITEMS = [
  { href: "/settings/profile", label: "Edit profile", sub: "Photo, banner, name, bio, tags", icon: UserCircle },
  { href: "/settings/account", label: "Account", sub: "Email and login", icon: Shield },
  { href: "/settings/privacy", label: "Privacy", sub: "Who can reach you", icon: Lock },
  { href: "/settings/notifications", label: "Notifications", sub: "What pings you", icon: Bell },
];

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" showBack />

      <div className="flex flex-col px-4 pt-2">
        {ITEMS.map(({ href, label, sub, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 rounded-2xl px-2 py-3.5 transition-colors hover:bg-white/[0.03]"
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

      <div className="px-5 pt-6">
        <SignOutButton />
      </div>
    </>
  );
}
