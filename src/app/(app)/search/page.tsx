"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { safeBack } from "@/lib/safe-back";
import { ChevronLeft, SearchX, Hash } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/ToastProvider";
import { SearchBar } from "@/components/ui/SearchBar";
import { FilterPills } from "@/components/ui/FilterPills";
import { EmptyState } from "@/components/ui/EmptyState";
import { Avatar } from "@/components/ui/Avatar";
import { VerifiedStar } from "@/components/ui/VerifiedStar";
import { type FeedPost } from "@/components/feed/FeedCard";
import { PostResultsGrid } from "@/components/search/PostResultsGrid";
import { ListRowSkeleton } from "@/components/skeletons/Skeletons";
import { SearchDiscovery } from "@/components/search/SearchDiscovery";
import Link from "next/link";

type Profile = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_hue: number | null;
  avatar_url: string | null;
  bio: string | null;
  /** From search_people's ranking — shown as the one line that explains order. */
  followers?: number | null;
  is_verified?: boolean | null;
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
  } catch {
    /* quota / private mode — non-fatal */
  }
}

export default function SearchPage() {
  const router = useRouter();
  const supabase = createClient();
  const [query, setQuery] = useState(() =>
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("q") ?? ""
      : ""
  );
  const [tab, setTab] = useState("Top");
  const [people, setPeople] = useState<Profile[]>([]);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const toast = useToast();
  const [tags, setTags] = useState<{ tag: string; count: number }[]>([]);
  const [searched, setSearched] = useState(false);
  const [userId, setUserId] = useState("");
  const [followedTags, setFollowedTags] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [recent, setRecent] = useState<string[]>([]);
  /** "Did you mean …" candidates for the term that was actually typed. */
  const [suggestions, setSuggestions] = useState<
    { term: string; kind: string }[]
  >([]);
  const blockedRef = useRef<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resolve current user (for FeedCard hype/save attribution) + seed from ?q=
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id ?? "";
      setUserId(uid);
      if (uid) {
        supabase
          .from("hashtag_follows")
          .select("tag")
          .eq("user_id", uid)
          .then(({ data: rows }) =>
            setFollowedTags(new Set((rows ?? []).map((r: any) => r.tag)))
          );
        supabase
          .from("blocked_users")
          .select("blocked_id")
          .eq("blocker_id", uid)
          .then(({ data: rows }) => {
            blockedRef.current = new Set(
              (rows ?? []).map((r: any) => r.blocked_id as string)
            );
          });
      }
    });
    setRecent(loadRecent());
    if (query) {
      if (query.startsWith("#")) setTab("Tags");
      runSearch(query);
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Record a completed search — moves to front, deduped, capped. Only called
   *  on deliberate "run this" moments (Enter, a recent/trending chip tap), not
   *  on every keystroke, so the list stays meaningful. */
  function pushRecent(term: string) {
    const t = term.trim();
    if (!t) return;
    setRecent((prev) => {
      const next = [
        t,
        ...prev.filter((x) => x.toLowerCase() !== t.toLowerCase()),
      ].slice(0, RECENT_CAP);
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
    if (error) {
      setFollowedTags((prev) => {
        const next = new Set(prev);
        was ? next.add(t) : next.delete(t);
        return next;
      });
      toast("Couldn't update that topic", "error");
      return;
    }
    // Followed tags feed tagAffinity in the ranker, so this is a feed
    // change, not a bookmark. Say so — nothing else in the app tells you.
    toast(
      was ? `Unfollowed #${t}` : `Following #${t} — more of it in your feed`,
      was ? "plain" : "success"
    );
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
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({ tag, count }));
  }

  async function runSearch(q: string) {
    const trimmed = q.trim();
    if (!trimmed) {
      setPeople([]);
      setPosts([]);
      setTags([]);
      setSuggestions([]);
      setSearched(false);
      return;
    }
    setSearched(true);
    const isTag = trimmed.startsWith("#");
    const isUser = trimmed.startsWith("@");
    const term = trimmed.replace(/^[#@]/, "").toLowerCase();
    if (!term) return;

    startTransition(async () => {
      // Both sides are ranked in SQL now (0062). They used to be
      // `ilike '%term%'` ordered by all-time hype, which had no notion of a
      // better match and made the top result for any live topic the oldest
      // popular post about it. The term also used to be interpolated into
      // PostgREST's `or=` filter, where a comma is syntax — so searching
      // "hey, you" did not return poor results, it returned wrong ones.
      const peopleRes = isTag
        ? { data: [] as Profile[] }
        : await supabase.rpc("search_people", { p_q: trimmed, p_limit: 20 });

      const postsRes = isUser
        ? { data: [] as any[] }
        : await supabase
            .rpc("search_posts", { p_q: trimmed, p_limit: 24 })
            .select(
              "*, profiles!posts_user_id_fkey(id, display_name, username, avatar_hue, avatar_url, profile_tags, is_verified)"
            );

      // Asked for on every search, shown only when the results are thin —
      // see the row below. Cheap, and doing it here means the answer is ready
      // at the same moment the disappointment is.
      supabase
        .rpc("search_suggestions", { p_q: trimmed, p_limit: 3 })
        .then(({ data }) =>
          setSuggestions(
            ((data ?? []) as { term: string; kind: string }[]).map((r) => ({
              term: r.term,
              kind: r.kind,
            }))
          )
        );

      setPeople(
        (peopleRes.data ?? []).filter(
          (p: Profile) => !blockedRef.current.has(p.id)
        )
      );
      const np = normPosts(postsRes.data ?? []).filter(
        (p) => !blockedRef.current.has(p.user_id)
      );
      setPosts(np);
      setTags(isUser ? [] : tagsFrom(np, isTag ? undefined : term));
      if (isTag) setTab((t) => (t === "People" ? "Posts" : t));
    });
  }

  const showPeople = tab === "Top" || tab === "People";
  const showPosts = tab === "Top" || tab === "Posts";
  const showTags = tab === "Top" || tab === "Tags";
  const resultCount = people.length + posts.length + tags.length;
  const hasResults = resultCount > 0;

  return (
    <>
      {/* Header */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border/60 bg-background/80 px-2 backdrop-blur-xl">
        <button
          type="button"
          onClick={() => safeBack(router)}
          aria-label="Back"
          className="flex h-10 w-10 items-center justify-center rounded-full text-foreground hover:bg-white/5"
        >
          <ChevronLeft size={24} />
        </button>
        <div className="flex-1">
          <SearchBar
            placeholder="Search people, posts, #tags"
            autoFocus
            value={query}
            onChange={(q) => {
              setQuery(q);
              if (debounceRef.current) clearTimeout(debounceRef.current);
              // Emptying the box should show the browse screen at once, not
              // after a debounce spent waiting for a search nobody asked for.
              if (q.trim() === "") {
                runSearch("");
                return;
              }
              debounceRef.current = setTimeout(
                () => runSearch(q),
                SEARCH_DEBOUNCE_MS
              );
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
          <FilterPills
            options={["Top", "People", "Posts", "Tags"]}
            onChange={setTab}
          />
        </div>
      )}

      {isPending && (
        <div className="flex flex-col pt-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <ListRowSkeleton key={i} avatarSize={46} />
          ))}
        </div>
      )}

      {/* Did you mean …
          Shown when the results are thin, which is when a typo is the likely
          explanation — not on every search, because correcting someone who
          found what they wanted is just noise. The suggestion RUNS the search
          rather than only filling the box: being told the right spelling and
          then having to press enter yourself is a hint, not a fix. */}
      {!isPending && searched && suggestions.length > 0 && resultCount < 3 && (
        <p className="px-4 pt-3 text-sm text-muted">
          Did you mean{" "}
          {suggestions.map((s, i) => (
            <span key={s.term}>
              {i > 0 && <span className="text-faint"> · </span>}
              <button
                type="button"
                onClick={() =>
                  searchFromChip(s.kind === "tag" ? `#${s.term}` : s.term)
                }
                className="font-bold text-accent underline underline-offset-2"
              >
                {s.kind === "tag" ? `#${s.term}` : s.term}
              </button>
            </span>
          ))}
          ?
        </p>
      )}

      {!isPending && searched && !hasResults && (
        <EmptyState
          icon={SearchX}
          title="Nothing turned up"
          text="Try a different name, post, or #tag."
        />
      )}

      {!isPending && !searched && (
        <SearchDiscovery
          currentUserId={userId}
          recent={recent}
          onSearch={searchFromChip}
          onRemoveRecent={removeRecentTerm}
          onClearRecent={clearAllRecent}
        />
      )}

      {!isPending && hasResults && (
        <div className="pb-4">
          {/* Tags */}
          {showTags && tags.length > 0 && (
            <>
              <h2 className="px-4 pb-1 pt-3 text-xs font-bold uppercase tracking-widest text-faint">
                Tags
              </h2>
              <div className="flex flex-col">
                {tags.map((t) => {
                  const isFollowed = followedTags.has(
                    t.tag.replace(/^#/, "").toLowerCase()
                  );
                  return (
                    <div
                      key={t.tag}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03]"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setQuery(`#${t.tag}`);
                          setTab("Posts");
                          runSearch(`#${t.tag}`);
                          pushRecent(`#${t.tag}`);
                        }}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface">
                          <Hash size={18} className="text-hashtag" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">
                            #{t.tag}
                          </p>
                          <p className="truncate text-xs text-muted">
                            {t.count} {t.count === 1 ? "post" : "posts"}
                          </p>
                        </div>
                      </button>
                      {userId && (
                        <button
                          type="button"
                          onClick={() => toggleTagFollow(t.tag)}
                          className={`shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-colors ${
                            isFollowed
                              ? "border border-border text-foreground"
                              : "bg-accent text-accent-ink"
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
              <h2 className="px-4 pb-1 pt-3 text-xs font-bold uppercase tracking-widest text-faint">
                People
              </h2>
              {people.map((u) => (
                <Link
                  key={u.id}
                  href={u.username ? `/u/${u.username}` : "#"}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03]"
                >
                  <Avatar
                    name={u.display_name ?? u.username ?? "U"}
                    hue={u.avatar_hue ?? 280}
                    size={44}
                    src={u.avatar_url ?? undefined}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {u.display_name ?? u.username}
                    </p>
                    {/* Handle plus followers, because the ranker weighs both
                        and a list whose order you cannot account for reads as
                        no order at all. */}
                    <p className="truncate text-xs text-muted">
                      @{u.username}
                      {typeof u.followers === "number" && u.followers > 0 && (
                        <>
                          {" · "}
                          {u.followers} follower{u.followers === 1 ? "" : "s"}
                        </>
                      )}
                    </p>
                  </div>
                </Link>
              ))}
            </>
          )}

          {/* Posts */}
          {showPosts && posts.length > 0 && (
            <>
              <h2 className="px-4 pb-2 pt-4 text-xs font-bold uppercase tracking-widest text-faint">
                Posts
              </h2>
              <PostResultsGrid posts={posts} currentUserId={userId} />
            </>
          )}
        </div>
      )}
    </>
  );
}
