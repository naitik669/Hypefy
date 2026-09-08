import Link from "next/link";
import { Compass } from "lucide-react";
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
      {/* Search briefly sat here beside the compass. Two icons crowded the
          wordmark and read as bolted on, so it moved to a hold on the Home tab
          alongside Discover, Activity and Saved — and swiping right from the
          feed now reaches Discover too. Both flanks stay the same width so the
          feed switcher is centred on the bar. */}
      <div className="flex w-20 items-center">
        <Link
          href="/discover"
          aria-label="Discover"
          className="flex h-10 w-10 items-center justify-center rounded-full text-foreground transition-colors hover:bg-white/5"
        >
          <Compass size={22} strokeWidth={2.2} />
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
