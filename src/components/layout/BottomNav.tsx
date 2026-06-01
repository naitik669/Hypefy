"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Send, Plus, Compass, User } from "lucide-react";

const items = [
  { href: "/home", label: "Home", Icon: Home },
  { href: "/messages", label: "Messages", Icon: Send },
  { href: "/discover", label: "Discover", Icon: Compass },
  { href: "/profile", label: "Profile", Icon: User },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto flex h-[72px] w-full max-w-[480px] items-center justify-around border-t border-border/60 bg-background/85 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
      {/* left two */}
      {items.slice(0, 2).map(({ href, label, Icon }) => (
        <NavItem
          key={href}
          href={href}
          label={label}
          Icon={Icon}
          active={pathname.startsWith(href)}
        />
      ))}

      {/* center create */}
      <Link
        href="/create"
        aria-label="Create"
        className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-accent-ink shadow-[0_8px_24px_-6px_rgba(200,255,0,0.6)] transition-transform active:scale-95"
      >
        <Plus size={26} strokeWidth={2.6} />
      </Link>

      {/* right two */}
      {items.slice(2).map(({ href, label, Icon }) => (
        <NavItem
          key={href}
          href={href}
          label={label}
          Icon={Icon}
          active={pathname.startsWith(href)}
        />
      ))}
    </nav>
  );
}

function NavItem({
  href,
  label,
  Icon,
  active,
}: {
  href: string;
  label: string;
  Icon: typeof Home;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={`flex h-12 w-12 flex-col items-center justify-center gap-1 transition-colors ${
        active ? "text-foreground" : "text-faint hover:text-muted"
      }`}
    >
      <Icon size={24} strokeWidth={active ? 2.6 : 2} />
      <span
        className={`h-1 w-1 rounded-full transition-colors ${
          active ? "bg-accent" : "bg-transparent"
        }`}
      />
    </Link>
  );
}
