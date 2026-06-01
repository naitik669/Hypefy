import Link from "next/link";
import { Compass, Bell } from "lucide-react";

/** Home top bar: discover · Hypefy wordmark · notifications. */
export function TopBar() {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border/60 bg-background/80 px-4 backdrop-blur-xl">
      <Link
        href="/discover"
        aria-label="Discover"
        className="flex h-9 w-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-white/5"
      >
        <Compass size={22} strokeWidth={2.2} />
      </Link>

      <span className="text-xl font-extrabold tracking-tight">
        Hypefy<span className="text-accent">.</span>
      </span>

      <Link
        href="/notifications"
        aria-label="Notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-white/5"
      >
        <Bell size={22} strokeWidth={2.2} />
        <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent ring-2 ring-background" />
      </Link>
    </header>
  );
}
