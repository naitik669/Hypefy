"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, SearchX, Loader2, Hash } from "lucide-react";
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
  avatar_url: string | null;
  bio: string | null;
};

export default function SearchPage() {
  const router = useRouter();
  const supabase = createClient();
  const [query, setQuery] = useState(() =>
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("q") ?? "" : "",
  );
  const [tab, setTab] = useState("Top");
  const [people, setPeople] = useState<Profile[]>([]);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [tags, setTags] = useState<{ tag: string; count: number }[]>([]);
  const [searched, setSearched] = useState(false);
  const [userId, setUserId] = useState("");
  const [isPending, startTransition] = useTransition();

  // Resolve current user (for FeedCard hype/save attribution) + seed from ?q=
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? ""));
    if (query) {
      if (query.startsWith("#")) setTab("Tags");
      runSearch(query);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function normPosts(rows: any[]): FeedPost[] {
    return (rows ?? []).map((p: any) => ({
      ...p,
      profiles: Array.isArray(p.profiles) ? p.profiles[0] ?? null : p.profiles,
    })) as FeedPost[];
  }

  function tagsFrom(rows: FeedPost[], filter?: string) {
    const counts = new Map<string, number>();
    for (const p of rows) {
      for (const raw of ((p as any).hashtags ?? []) as string[]) {
        const tag = raw.replace(/^#/, "").toLowerCase();
        if (!tag) continue;
        if (filter && !tag.includes(filter)) continue;
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count }));
  }

  async function runSearch(q: string) {
    const trimmed = q.trim();
    if (!trimmed) { setPeople([]); setPosts([]); setTags([]); setSearched(false); return; }
    setSearched(true);
    const isTag = trimmed.startsWith("#");
    const isUser = trimmed.startsWith("@");
    const term = trimmed.replace(/^[#@]/, "").toLowerCase();
    if (!term) return;

    startTransition(async () => {
      // People (skip when explicitly searching a hashtag)
      const peopleRes = isTag
        ? { data: [] as Profile[] }
        : await supabase
            .from("profiles")
            .select("id, display_name, username, avatar_hue, avatar_url, bio")
            .eq("profile_completed", true)
            .or(`username.ilike.%${term}%,display_name.ilike.%${term}%`)
            .limit(20);

      // Posts â€” by hashtag (array contains) or by text
      const postsRes = isUser
        ? { data: [] as any[] }
        : isTag
          ? await supabase
              .from("posts")
              .select("*, profiles(id, display_name, username, avatar_hue, avatar_url, profile_tags)")
              .contains("hashtags", [term])
              .order("hype_count", { ascending: false })
              .limit(20)
          : await supabase
              .from("posts")
              .select("*, profiles(id, display_name, username, avatar_hue, avatar_url, profile_tags)")
              .or(`caption.ilike.%${term}%,body.ilike.%${term}%`)
              .order("hype_count", { ascending: false })
              .limit(20);

      setPeople(peopleRes.data ?? []);
      const np = normPosts(postsRes.data ?? []);
      setPosts(np);
      setTags(isUser ? [] : tagsFrom(np, isTag ? undefined : term));
      if (isTag) setTab((t) => (t === "People" ? "Posts" : t));
    });
  }

  const showPeople = tab === "Top" || tab === "People";
  const showPosts = tab === "Top" || tab === "Posts";
  const showTags = tab === "Top" || tab === "Tags";
  const hasResults = people.length > 0 || posts.length > 0 || tags.length > 0;

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
            placeholder="Search people, posts, #tags"
            autoFocus
            defaultValue={query}
            onChange={(q) => { setQuery(q); runSearch(q); }}
          />
        </div>
      </header>

      {query.trim().length > 0 && (
        <div className="pt-3">
          <FilterPills options={["Top", "People", "Posts", "Tags"]} onChange={setTab} />
        </div>
      )}

      {isPending && (
        <div className="flex items-center justify-center py-10">
          <div className="w-full px-4">
            {/* Shimmer skeleton rows shaped like people results */}
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-2.5">
                <div className="skeleton h-12 w-12 shrink-0 rounded-[30%]" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="skeleton h-3 rounded" style={{ width: `${40 + (i % 3) * 15}%` }} />
                  <div className="skeleton h-2.5 w-20 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isPending && searched && !hasResults && (
        <EmptyState icon={SearchX} title="Nothing turned up" text="Try a different name, post, or #tag." />
      )}

      {!isPending && !searched && (
        <div className="px-4 py-6 text-center text-sm text-faint">
          Search people or posts
        </div>
      )}

      {!isPending && hasResults && (
        <div className="pb-4">
          {/* Tags */}
          {showTags && tags.length > 0 && (
            <>
              <h2 className="px-4 pb-1 pt-3 text-sm font-bold text-muted">Tags</h2>
              <div className="flex flex-col">
                {tags.map((t) => (
                  <button
                    key={t.tag}
                    type="button"
                    onClick={() => { setQuery(`#${t.tag}`); setTab("Posts"); runSearch(`#${t.tag}`); }}
                    className="flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/[0.03]"
                  >
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface">
                      <Hash size={18} className="text-hashtag" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">#{t.tag}</p>
                      <p className="truncate text-xs text-muted">{t.count} {t.count === 1 ? "post" : "posts"}</p>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

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
                  <Avatar name={u.display_name ?? u.username ?? "U"} hue={u.avatar_hue ?? 280} size={44} src={u.avatar_url ?? undefined} />
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
                  <FeedCard key={p.id} post={p} currentUserId={userId} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
