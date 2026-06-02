"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, SearchX, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { SearchBar } from "@/components/ui/SearchBar";
import { FilterPills } from "@/components/ui/FilterPills";
import { EmptyState } from "@/components/ui/EmptyState";
import { Avatar } from "@/components/ui/Avatar";
import { VerifiedStar } from "@/components/ui/VerifiedStar";
import { FeedCard, type FeedPost } from "@/components/feed/FeedCard";
import Link from "next/link";

type Profile = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_hue: number | null;
  bio: string | null;
};

export default function SearchPage() {
  const router = useRouter();
  const supabase = createClient();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("Top");
  const [people, setPeople] = useState<Profile[]>([]);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [searched, setSearched] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function runSearch(q: string) {
    if (!q.trim()) { setPeople([]); setPosts([]); setSearched(false); return; }
    setSearched(true);
    startTransition(async () => {
      const term = q.trim().toLowerCase();
      const [peopleRes, postsRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, display_name, username, avatar_hue, bio")
          .eq("profile_completed", true)
          .or(`username.ilike.%${term}%,display_name.ilike.%${term}%`)
          .limit(20),
        supabase
          .from("posts")
          .select("*, profiles(id, display_name, username, avatar_hue, profile_tags)")
          .or(`caption.ilike.%${term}%,body.ilike.%${term}%`)
          .order("hype_count", { ascending: false })
          .limit(20),
      ]);
      setPeople(peopleRes.data ?? []);
      const normPosts = (postsRes.data ?? []).map((p: any) => ({
        ...p,
        profiles: Array.isArray(p.profiles) ? p.profiles[0] ?? null : p.profiles,
      })) as FeedPost[];
      setPosts(normPosts);
    });
  }

  const showPeople = tab === "Top" || tab === "People";
  const showPosts = tab === "Top" || tab === "Posts";
  const hasResults = people.length > 0 || posts.length > 0;

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
            onChange={(q) => { setQuery(q); runSearch(q); }}
          />
        </div>
      </header>

      {query.trim().length > 0 && (
        <div className="pt-3">
          <FilterPills options={["Top", "People", "Posts"]} onChange={setTab} />
        </div>
      )}

      {isPending && (
        <div className="flex items-center justify-center py-10">
          <Loader2 size={22} className="animate-spin text-muted" />
        </div>
      )}

      {!isPending && searched && !hasResults && (
        <EmptyState icon={SearchX} title="No results found" text="Try searching a name or post." />
      )}

      {!isPending && !searched && (
        <div className="px-4 py-6 text-center text-sm text-faint">
          Search people or posts
        </div>
      )}

      {!isPending && hasResults && (
        <div className="pb-4">
          {/* People */}
          {showPeople && people.length > 0 && (
            <>
              <h2 className="px-4 pb-1 pt-3 text-sm font-bold text-muted">People</h2>
              {people.map((u) => (
                <Link
                  key={u.id}
                  href={u.username ? `/u/${u.username}` : "#"}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03]"
                >
                  <Avatar name={u.display_name ?? u.username ?? "U"} hue={u.avatar_hue ?? 280} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{u.display_name ?? u.username}</p>
                    <p className="truncate text-xs text-muted">@{u.username}</p>
                  </div>
                </Link>
              ))}
            </>
          )}

          {/* Posts */}
          {showPosts && posts.length > 0 && (
            <>
              <h2 className="px-4 pb-2 pt-4 text-sm font-bold text-muted">Posts</h2>
              <div className="flex flex-col">
                {posts.map((p) => (
                  <FeedCard key={p.id} post={p} currentUserId="" />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
