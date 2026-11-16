"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Compass,
  Film,
  House,
  LibraryBig,
  MessageCircle,
  Search,
  Settings,
  ShoppingBag,
  User,
} from "lucide-react";
import { sideNavDestinations, destinationFor } from "@hypefy/core/navigation";
import { haptics } from "@/lib/haptics";

/**
 * Navigation for a screen wide enough to show it.
 *
 * Not a stretched bottom bar. Four destinations on the phone are reachable
 * only by holding a tab down — Search, Library, Marketplace, Settings, in
 * NavHoldMenu — and a mouse cannot hold. Right-click is wired as an alias,
 * which is correct and which nobody discovers. With room to spare, the
 * honest thing is to show them.
 *
 * Discover gets an entry for the same reason: on a phone it is the compass in
 * the top bar or a right-swipe from Home, and a right-swipe is not a thing a
 * pointer does.
 *
 * Rendered alongside the bottom bar and chosen between by breakpoint, never
 * by measuring the window. The app is server-rendered, and a layout that
 * depends on knowing the viewport width cannot be rendered on the server
 * without either guessing or flashing the wrong one.
 */

/** Icons live here, not in core: a component cannot cross into shared code. */
const ICONS: Record<string, typeof House> = {
  "/home": House,
  "/discover": Compass,
  "/shots": Film,
  "/messages": MessageCircle,
  "/profile": User,
  "/search": Search,
  "/library": LibraryBig,
  "/marketplace": ShoppingBag,
  "/settings": Settings,
};

export function SideNav() {
  const pathname = usePathname() ?? "";
  const here = destinationFor(pathname);

  return (
    <nav
      aria-label="Main"
      className="sticky top-0 hidden h-dvh shrink-0 flex-col gap-1 border-r border-border/60 px-3 py-4 lg:flex"
      style={{ width: "var(--sidenav-w)" }}
    >
      <Link
        href="/home"
        className="mb-3 flex items-center gap-2 px-3 text-xl font-black tracking-tight"
        aria-label="Hypefy home"
      >
        H<span className="text-accent">.</span>
      </Link>

      {sideNavDestinations().map((d) => {
        const Icon = ICONS[d.href] ?? House;
        const on = here?.href === d.href;
        return (
          <Link
            key={d.href}
            href={d.href}
            // aria-current, not role="tab": these are links that load a page.
            // The ARIA tab pattern would promise arrow-key navigation between
            // them that does not exist — the same correction the creator and
            // activity strips needed.
            aria-current={on ? "page" : undefined}
            data-sidenav={d.href}
            onClick={() => haptics.select()}
            className={`flex items-center gap-3 rounded-pill px-3 py-2.5 text-sm font-bold transition-colors ${
              on ? "bg-accent text-accent-ink" : "text-muted hover:bg-elevated hover:text-foreground"
            }`}
          >
            <Icon size={19} strokeWidth={2.2} aria-hidden />
            {d.label}
          </Link>
        );
      })}
    </nav>
  );
}
