"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, PaperPlaneTilt, Lightning, User, Plus, X } from "@phosphor-icons/react";
import { CreateSheet } from "@/components/create/CreateSheet";

const items = [
  { href: "/home",     label: "Home",     Icon: House },
  { href: "/messages", label: "Messages", Icon: PaperPlaneTilt },
  { href: "/shots",    label: "Shots",    Icon: Lightning },
  { href: "/profile",  label: "Profile",  Icon: User },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto flex h-[72px] w-full max-w-[480px] items-center justify-around border-t border-border/60 bg-background/85 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
        {/* left two */}
        {items.slice(0, 2).map(({ href, label, Icon }) => (
          <NavItem key={href} href={href} label={label} Icon={Icon} active={pathname.startsWith(href)} />
        ))}

        {/* center create — opens sheet, not a page */}
        <button
          type="button"
          aria-label={createOpen ? "Close" : "Create"}
          onClick={() => setCreateOpen((v) => !v)}
          className="flex h-11 w-[68px] -translate-y-1.5 items-center justify-center rounded-[20px] bg-accent text-accent-ink shadow-md transition-all active:scale-95"
        >
          {createOpen ? (
            <X size={24} weight="bold" aria-hidden />
          ) : (
            <Plus size={26} weight="bold" aria-hidden />
          )}
        </button>

        {/* right two */}
        {items.slice(2).map(({ href, label, Icon }) => (
          <NavItem key={href} href={href} label={label} Icon={Icon} active={pathname.startsWith(href)} />
        ))}
      </nav>

      <CreateSheet open={createOpen} onClose={() => setCreateOpen(false)} />
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
      className={`flex h-12 w-12 flex-col items-center justify-center gap-1 transition-colors ${
        active ? "text-foreground" : "text-faint hover:text-muted"
      }`}
    >
      <Icon size={26} weight={active ? "fill" : "regular"} />
      <span
        className={`h-1 w-1 rounded-full transition-colors ${
          active ? "bg-accent" : "bg-transparent"
        }`}
      />
    </Link>
  );
}
