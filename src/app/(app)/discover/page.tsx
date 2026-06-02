import { Compass } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchBar } from "@/components/ui/SearchBar";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * Discover — real data placeholder.
 * No fake users (AMAN/riya/dev), no mock rooms or trending posts.
 * When `posts`, `rooms`, and `profiles` tables are wired:
 *   - Fetch trending posts (high hype_count)
 *   - Fetch suggested rooms
 *   - Fetch people to follow (not yet followed)
 * For now: clean empty state so new users don't see fake content.
 */
export default function DiscoverPage() {
  // TODO: real Supabase queries once posts/rooms tables exist.
  const hasTrending = false;
  const hasRooms = false;
  const hasPeople = false;
  const isEmpty = !hasTrending && !hasRooms && !hasPeople;

  return (
    <>
      <PageHeader title="Discover" />

      <div className="px-4 py-3">
        <SearchBar placeholder="Search people, rooms, posts" href="/search" />
      </div>

      {isEmpty ? (
        <EmptyState
          icon={Compass}
          title="Nothing here yet"
          text="Hypefy gets better as real people join. Check back soon."
        />
      ) : (
        <div>
          {/* Real trending, rooms, people sections go here */}
        </div>
      )}
    </>
  );
}
