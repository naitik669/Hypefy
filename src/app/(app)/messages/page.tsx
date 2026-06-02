import Link from "next/link";
import { PenSquare, MessageCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchBar } from "@/components/ui/SearchBar";
import { FilterPills } from "@/components/ui/FilterPills";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * Messages inbox — real data placeholder.
 * The `messages` table has not been wired yet.
 * When ready: fetch threads from Supabase and render MessageListItem rows.
 * No mock users (AMAN/riya/dev) shown in production.
 */
export default function MessagesPage() {
  // TODO: fetch real message threads once `messages` table is live.
  // const threads = await getRealThreads(userId);
  const threads: unknown[] = [];

  return (
    <>
      <PageHeader
        title="Messages"
        right={
          <Link
            href="/search"
            aria-label="New message"
            className="flex h-10 w-10 items-center justify-center rounded-full text-foreground hover:bg-white/5"
          >
            <PenSquare size={22} />
          </Link>
        }
      />

      <div className="px-4 py-3">
        <SearchBar placeholder="Search messages" href="/search" />
      </div>

      <FilterPills options={["All", "Rooms", "Unread", "Requests"]} />

      {threads.length > 0 ? (
        <div className="flex flex-col">
          {/* Real MessageListItem rows go here */}
        </div>
      ) : (
        <EmptyState
          icon={MessageCircle}
          title="No messages yet"
          text="Start a conversation when you find your people."
          ctaLabel="Discover"
          ctaHref="/discover"
        />
      )}
    </>
  );
}
