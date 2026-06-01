import { PageHeader } from "@/components/ui/PageHeader";
import { SearchBar } from "@/components/ui/SearchBar";
import { TrendingCard } from "@/components/discover/TrendingCard";
import { RoomCard } from "@/components/discover/RoomCard";
import { UserSuggestionCard } from "@/components/discover/UserSuggestionCard";
import { trending, rooms, people } from "@/lib/mock-discover";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="px-4 pb-2 pt-5 text-base font-bold tracking-tight">
      {children}
    </h2>
  );
}

export default function DiscoverPage() {
  return (
    <>
      <PageHeader title="Discover" />

      <div className="px-4 py-3">
        <SearchBar placeholder="Search people, rooms, posts" href="/search" />
      </div>

      {/* Blowing up */}
      <SectionTitle>Blowing up 🔥</SectionTitle>
      <div className="no-scrollbar flex gap-3 overflow-x-auto px-4 pb-1">
        {trending.map((p) => (
          <TrendingCard key={p.id} post={p} />
        ))}
      </div>

      {/* Rooms you might like */}
      <SectionTitle>Rooms you might like</SectionTitle>
      <div className="no-scrollbar flex gap-3 overflow-x-auto px-4 pb-1">
        {rooms.map((r) => (
          <div key={r.id} className="w-60 shrink-0">
            <RoomCard room={r} />
          </div>
        ))}
      </div>

      {/* People to hype */}
      <SectionTitle>People to hype</SectionTitle>
      <div className="flex flex-col pb-2">
        {people.map((u) => (
          <UserSuggestionCard key={u.id} user={u} />
        ))}
      </div>
    </>
  );
}
