import Link from "next/link";
import { Compass, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { FeedTabDropdown } from "@/components/layout/FeedTabDropdown";

/** Home top bar — server component so it can seed the real unread count. */
export async function TopBar() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let unread = 0;
  if (user) {
    const { count } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false);
    unread = count ?? 0;
  }

  return (
    <header className="sticky top-0 z-20 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center justify-between border-b border-border/60 bg-background/80 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      {/* Both flanks are the same width so the feed switcher stays centred
          now that the left side carries two icons rather than one. */}
      <div className="flex w-20 items-center">
        <Link
          href="/discover"
          aria-label="Discover"
          className="flex h-10 w-10 items-center justify-center rounded-full text-foreground transition-colors hover:bg-white/5"
        >
          <Compass size={22} strokeWidth={2.2} />
        </Link>
        {/* Search had no icon anywhere in the app: it lived two taps deep,
            behind the compass, on one screen. It is not a nav destination —
            it is the thing people reach for — so it sits here instead of
            costing a bottom-nav slot. */}
        <Link
          href="/search"
          aria-label="Search"
          className="flex h-10 w-10 items-center justify-center rounded-full text-foreground transition-colors hover:bg-white/5"
        >
          <Search size={21} strokeWidth={2.2} />
        </Link>
      </div>

      <FeedTabDropdown />

      <div className="flex w-20 justify-end">
        {user ? (
          <NotificationBell userId={user.id} initialUnread={unread} />
        ) : (
          <span className="h-9 w-9" />
        )}
      </div>
    </header>
  );
}
