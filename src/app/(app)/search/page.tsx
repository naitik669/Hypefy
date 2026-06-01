"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, SearchX, Clock } from "lucide-react";
import { SearchBar } from "@/components/ui/SearchBar";
import { FilterPills } from "@/components/ui/FilterPills";
import { EmptyState } from "@/components/ui/EmptyState";
import { UserSuggestionCard } from "@/components/discover/UserSuggestionCard";
import { RoomCard } from "@/components/discover/RoomCard";
import { TrendingCard } from "@/components/discover/TrendingCard";
import { people, rooms, trending } from "@/lib/mock-discover";

const recents = ["aman", "Meme Lab", "design", "late night"];

export default function SearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("Top");

  const q = query.trim().toLowerCase();
  const peopleR = people.filter(
    (u) => u.name.toLowerCase().includes(q) || u.handle.toLowerCase().includes(q),
  );
  const roomsR = rooms.filter((r) => r.name.toLowerCase().includes(q));
  const postsR = trending.filter((p) => p.username.toLowerCase().includes(q));
  const hasResults = peopleR.length + roomsR.length + postsR.length > 0;

  const showPeople = tab === "Top" || tab === "People";
  const showRooms = tab === "Top" || tab === "Rooms";
  const showPosts = tab === "Top" || tab === "Posts";

  return (
    <>
      {/* Header */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border/60 bg-background/80 px-2 backdrop-blur-xl">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Back"
          className="flex h-10 w-10 items-center justify-center rounded-full text-foreground hover:bg-white/5"
        >
          <ChevronLeft size={24} />
        </button>
        <div className="flex-1">
          <SearchBar
            placeholder="Search Hypefy"
            autoFocus
            onChange={setQuery}
          />
        </div>
      </header>

      {q.length === 0 ? (
        // Recents + suggestions
        <div className="pb-4">
          <h2 className="px-4 pb-1 pt-4 text-sm font-bold text-muted">
            Recent
          </h2>
          <div className="flex flex-col">
            {recents.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setQuery(r)}
                className="flex items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-white/[0.03]"
              >
                <Clock size={18} className="text-faint" />
                {r}
              </button>
            ))}
          </div>

          <h2 className="px-4 pb-2 pt-4 text-sm font-bold text-muted">
            Suggested rooms
          </h2>
          <div className="no-scrollbar flex gap-3 overflow-x-auto px-4">
            {rooms.slice(0, 4).map((r) => (
              <div key={r.id} className="w-56 shrink-0">
                <RoomCard room={r} />
              </div>
            ))}
          </div>

          <h2 className="px-4 pb-1 pt-5 text-sm font-bold text-muted">
            Trending people
          </h2>
          <div className="flex flex-col">
            {people.slice(0, 4).map((u) => (
              <UserSuggestionCard key={u.id} user={u} />
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="pt-3">
            <FilterPills options={["Top", "People", "Rooms", "Posts"]} onChange={setTab} />
          </div>

          {hasResults ? (
            <div className="pb-4">
              {showPeople && peopleR.length > 0 && (
                <>
                  <h2 className="px-4 pb-1 pt-3 text-sm font-bold text-muted">People</h2>
                  {peopleR.map((u) => (
                    <UserSuggestionCard key={u.id} user={u} />
                  ))}
                </>
              )}
              {showRooms && roomsR.length > 0 && (
                <>
                  <h2 className="px-4 pb-2 pt-4 text-sm font-bold text-muted">Rooms</h2>
                  <div className="flex flex-col gap-3 px-4">
                    {roomsR.map((r) => (
                      <RoomCard key={r.id} room={r} />
                    ))}
                  </div>
                </>
              )}
              {showPosts && postsR.length > 0 && (
                <>
                  <h2 className="px-4 pb-2 pt-4 text-sm font-bold text-muted">Posts</h2>
                  <div className="grid grid-cols-2 gap-3 px-4">
                    {postsR.map((p) => (
                      <TrendingCard key={p.id} post={p} />
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <EmptyState
              icon={SearchX}
              title="No results found"
              text="Try searching a name, room, or post."
            />
          )}
        </>
      )}
    </>
  );
}
