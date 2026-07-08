"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, SearchX, Loader2, Hash, Clock, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { SearchBar } from "@/components/ui/SearchBar";
import { FilterPills } from "@/components/ui/FilterPills";
import { EmptyState } from "@/components/ui/EmptyState";
import { Avatar } from "@/components/ui/Avatar";
import { VerifiedStar } from "@/components/ui/VerifiedStar";
import { FeedCard, type FeedPost } from "@/components/feed/FeedCard";
import { ListRowSkeleton } from "@/components/skeletons/Skeletons";
import Link from "next/link";

type Profile = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_hue: number | null;
  avatar_url: string | null;
  bio: string | null;
};

const RECENT_KEY = "hypefy_recent_searches";
const RECENT_CAP = 8;
const SEARCH_DEBOUNCE_MS = 350;

function loadRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}
function persistRecent(list: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_CAP)));
  } catch { /* quota / private mode — non-fatal */ }
}

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
  const [followedTags, setFollowedTags] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [recent, setRecent] = useState<string[]>([]);
  const [trendingTags, setTrendingTags] = useState<{ tag: string; count: number }[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resolve current user (for FeedCard hype/save attribution) + seed from ?q=
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id ?? "";
      setUserId(uid);
      if (uid) {
        supabase.from("hashtag_follows").select("tag").eq("user_id", uid)
          .then(({ data: rows }) => setFollowedTags(new Set((rows ?? []).map((r: any) => r.tag))));
      }
    });
    setRecent(loadRecent());
    supabase.rpc("get_trending_tags", { p_limit: 10 }).then(({ data }) => {
      setTrendingTags(((data ?? []) as any[]).map((t) => ({ tag: t.tag, count: t.recent ?? 0 })));
    });
    if (query) {
      if (query.startsWith("#")) setTab("Tags");
      runSearch(query);
    }
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Record a completed search — moves to front, deduped, capped. Only called
   *  on deliberate "run this" moments (Enter, a recent/trending chip tap), not
   *  on every keystroke, so the list stays meaningful. */
  function pushRecent(term: string) {
    const t = term.trim();
    if (!t) return;
    setRecent((prev) => {
      const next = [t, ...prev.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, RECENT_CAP);
      persistRecent(next);
      return next;
    });
  }
  function removeRecentTerm(term: string) {
    setRecent((prev) => {
      const next = prev.filter((x) => x !== term);
      persistRecent(next);
      return next;
    });
  }
  function clearAllRecent() {
    setRecent([]);
    persistRecent([]);
  }
  /** Kick off a search from a chip (recent or trending) — same effect as typing + Enter. */
  function searchFromChip(term: string) {
    setQuery(term);
    if (term.startsWith("#")) setTab("Tags");
    runSearch(term);
    pushRecent(term);
  }

  async function toggleTagFollow(tag: string) {
    const t = tag.replace(/^#/, "").toLowerCase();
    const was = followedTags.has(t);
    // optimistic
    setFollowedTags((prev) => {
      const next = new Set(prev);
      was ? next.delete(t) : next.add(t);
      return next;
    });
    const { error } = await supabase.rpc("toggle_hashtag_follow", { p_tag: t });
    if (error) setFollowedTags((prev) => {
      const next = new Set(prev);
      was ? next.add(t) : next.delete(t);
      return next;
    });
  }

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
              .select("*, profiles(id, display_name, username, avatar_hue, avatar_url, profile_tags, is_verified)")
              .contains("hashtags", [term])
              .order("hype_count", { ascending: false })
              .limit(20)
          : await supabase
              .from("posts")
              .select("*, profiles(id, display_name, username, avatar_hue, avatar_url, profile_tags, is_verified)")
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
            onChange={(q) => {
              setQuery(q);
              if (debounceRef.current) clearTimeout(debounceRef.current);
              debounceRef.current = setTimeout(() => runSearch(q), SEARCH_DEBOUNCE_MS);
            }}
            onSubmit={() => {
              if (debounceRef.current) clearTimeout(debounceRef.current);
              runSearch(query);
              pushRecent(query);
            }}
          />
        </div>
      </header>

      {query.trim().length > 0 && (
        <div className="pt-3">
          <FilterPills options={["Top", "People", "Posts", "Tags"]} onChange={setTab} />
        </div>
      )}

      {isPending && (
        <div className="flex flex-col pt-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <ListRowSkeleton key={i} avatarSize={46} />
          ))}
        </div>
      )}

      {!isPending && searched && !hasResults && (
        <EmptyState icon={SearchX} title="Nothing turned up" text="Try a different name, post, or #tag." />
      )}

      {!isPending && !searched && (
        <div className="px-4 py-4">
          {recent.length === 0 && trendingTags.length === 0 && (
            <p className="py-6 text-center text-sm text-faint">Search people or posts</p>
          )}

          {recent.length > 0 && (
            <div className="mb-6">
              <div className="mb-1 flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-widest text-faint">Recent</h2>
                <button
                  type="button"
                  onClick={clearAllRecent}
                  className="text-xs font-semibold text-muted transition-colors hover:text-foreground"
                >
                  Clear all
                </button>
              </div>
              <div className="flex flex-col">
                {recent.map((term) => (
                  <div key={term} className="flex items-center gap-3 py-2">
                    <button
                      type="button"
                      onClick={() => searchFromChip(term)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-muted">
                        <Clock size={16} />
                      </span>
                      <span className="truncate text-sm">{term}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => removeRecentTerm(term)}
                      aria-label={`Remove "${term}" from recent searches`}
                      className="shrink-0 p-1.5 text-faint transition-colors hover:text-foreground"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {trendingTags.length > 0 && (
            <div>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-faint">Trending</h2>
              <div className="flex flex-wrap gap-2">
                {trendingTags.map((t) => (
                  <button
                    key={t.tag}
                    type="button"
                    onClick={() => searchFromChip(`#${t.tag}`)}
                    className="rounded-pill border border-border bg-surface px-3.5 py-2 text-sm font-semibold text-hashtag transition-transform active:scale-95"
                  >
                    #{t.tag}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!isPending && hasResults && (
        <div className="pb-4">
          {/* Tags */}
          {showTags && tags.length > 0 && (
            <>
              <h2 className="px-4 pb-1 pt-3 text-xs font-bold uppercase tracking-widest text-faint">Tags</h2>
              <div className="flex flex-col">
                {tags.map((t) => {
                  const isFollowed = followedTags.has(t.tag.replace(/^#/, "").toLowerCase());
                  return (
                    <div key={t.tag} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03]">
                      <button
                        type="button"
                        onClick={() => { setQuery(`#${t.tag}`); setTab("Posts"); runSearch(`#${t.tag}`); pushRecent(`#${t.tag}`); }}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface">
                          <Hash size={18} className="text-hashtag" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">#{t.tag}</p>
                          <p className="truncate text-xs text-muted">{t.count} {t.count === 1 ? "post" : "posts"}</p>
                        </div>
                      </button>
                      {userId && (
                        <button
                          type="button"
                          onClick={() => toggleTagFollow(t.tag)}
                          className={`shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-colors ${
                            isFollowed ? "border border-border text-foreground" : "bg-accent text-accent-ink"
                          }`}
                        >
                          {isFollowed ? "Following" : "Follow"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* People */}
          {showPeople && people.length > 0 && (
            <>
              <h2 className="px-4 pb-1 pt-3 text-xs font-bold uppercase tracking-widest text-faint">People</h2>
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
              <h2 className="px-4 pb-2 pt-4 text-xs font-bold uppercase tracking-widest text-faint">Posts</h2>
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
