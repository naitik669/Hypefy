"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Zap, MessageCircle, Play, Compass, Hash } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchBar } from "@/components/ui/SearchBar";
import { DiscoverFilter } from "@/components/discover/DiscoverFilter";
import { ShotPreview } from "@/components/shots/ShotPreview";
import { UserSuggestionCard } from "@/components/discover/UserSuggestionCard";
import { PinFeed, type Pin } from "@/components/discover/PinFeed";
import { formatCount } from "@/lib/format";
import { reshuffle } from "@/lib/discover-mix";
import { HypedByYourPeople } from "@/components/discover/HypedByYourPeople";

type Shot = {
  id: string;
  media_url: string;
  poster_url: string | null;
  caption: string | null;
  hype_count: number;
  comment_count: number;
  profiles: {
    display_name: string | null;
    username: string | null;
    avatar_hue: number | null;
  } | null;
};
type Person = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_hue: number | null;
  avatar_url?: string | null;
  is_verified?: boolean | null;
};
type Tag = { tag: string; count: number };

/**
 * Discover, laid out like Pinterest.
 *
 * It used to be a stack of sections — trending tags, a Shots rail, a
 * "Blowing up" grid, an interests rail, creators, six topic rails and a
 * "Fresh" grid that ended in a Show more button. Each was reasonable on its
 * own; together they made Discover a page you read down rather than one you
 * browse, and every rail was a sideways scroll inside a vertical one.
 *
 * Now For You is one thing: a single ranked masonry that carries on by itself
 * as you scroll, with Shots scattered through it among the posts rather than
 * parked in a rail above — a video is just another thing you come across.
 * The topics that were rails are chips, the way Pinterest's are — tapping one
 * turns the grid into that topic. People and tags keep their own chips, so
 * nothing that was here is gone; it just is not all in one scroll.
 */
export function DiscoverView({
  currentUserId,
  rankedPosts,
  feedCursor,
  blockedIds,
  trendingPosts,
  trendingShots,
  feedShots = [],
  people,
  newPeople = [],
  categoryRails = [],
  tags,
}: {
  currentUserId: string;
  /** Every post in the server's pool, best first. The For You feed. */
  rankedPosts: Pin[];
  /** The oldest post in that pool; the endless feed reads on from here. */
  feedCursor: string | null;
  blockedIds: string[];
  trendingPosts: Pin[];
  trendingShots: Shot[];
  /** Every Shot in the pool, best first, for scattering through the feed. */
  feedShots?: Shot[];
  people: Person[];
  newPeople?: Person[];
  categoryRails?: { label: string; posts: Pin[] }[];
  tags: Tag[];
}) {
  const router = useRouter();
  const [cat, setCat] = useState<string>("For You");
  /** Bumped by Refresh at the end of the feed. Also the shuffle seed: asking
   *  the server again returns the same ranking, so without this the feed came
   *  back in exactly the order you had just scrolled through. */
  const [refreshCount, setRefreshCount] = useState(0);
  const feed = useMemo(() => reshuffle(rankedPosts, refreshCount), [rankedPosts, refreshCount]);

  function refreshFeed() {
    setRefreshCount((n) => n + 1);
    // Still asks the server, so anything posted since actually arrives.
    router.refresh();
  }

  const everythingEmpty =
    rankedPosts.length === 0 && trendingShots.length === 0 && people.length === 0;

  if (everythingEmpty) {
    return (
      // "Check back soon" was the only dead end left in the app: every other
      // empty state offers an action, and this one is likely a new account's
      // first sight of Discover. Posting is the thing that actually fills it.
      <EmptyState
        icon={Compass}
        title="Nothing to discover yet"
        text="Discover fills up as people post. Be the reason it does."
        ctaLabel="Create a post"
        ctaHref="/create/post"
      />
    );
  }

  const topic = categoryRails.find((c) => c.label === cat);

  return (
    <>
{/* Search, and the categories behind one button beside it.
          They used to be a scrolling row of chips under the search bar: ten
          of them, most off the right edge, taking a band of every screen to
          say what you are looking at — which is almost always "For You". */}
      <div className="sticky top-14 z-10 chrome-bar flex items-center gap-2 px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <SearchBar placeholder="Search people, posts, #tags" href="/search" />
        </div>
        <DiscoverFilter
          value={cat}
          topics={categoryRails.map((c) => c.label)}
          onChange={setCat}
        />
      </div>

      <div key={cat} className="animate-fade-swap pb-6">
        {cat === "For You" && (
          <div className="pt-2">
            {/* Keyed on the page it starts from and on the refresh, so Refresh
                starts the feed over rather than staying "done" at the bottom. */}
            <PinFeed
              key={`${feedCursor ?? ""}:${rankedPosts[0]?.id ?? ""}:${refreshCount}`}
              posts={feed}
              shots={feedShots}
              currentUserId={currentUserId}
              endless={{ cursor: feedCursor, blockedIds }}
              onRefresh={refreshFeed}
            />
          </div>
        )}

        {cat === "Blowing Up" && (
          <Section title="Blowing up 🔥">
            <PinFeed posts={trendingPosts} currentUserId={currentUserId} />
          </Section>
        )}

        {topic && (
          <Section title={topic.label}>
            <PinFeed posts={topic.posts} currentUserId={currentUserId} />
          </Section>
        )}

        {/* One reason over a row of three, before the grid. It answers
            "why am I seeing this" without exposing the ranking, and it only
            appears when three of these actually carry it. */}
        {cat === "Shots" && trendingShots.length > 0 && (
          <HypedByYourPeople
            shots={trendingShots}
            renderTile={(id) => {
              const s = trendingShots.find((x) => x.id === id);
              return s ? <ShotTile shot={s} /> : null;
            }}
          />
        )}

        {cat === "Shots" &&
          (trendingShots.length > 0 ? (
            <Section title="Shots">
              <div className="grid grid-cols-3 gap-1 px-1">
                {trendingShots.map((s) => (
                  <ShotTile key={s.id} shot={s} />
                ))}
              </div>
            </Section>
          ) : (
            <EmptyState icon={Play} title="No Shots fired yet" text="Be the first one on the reel." />
          ))}

        {cat === "People" &&
          (people.length > 0 || newPeople.length > 0 ? (
            <>
              {people.length > 0 && (
                <Section eyebrow="Follow" title="Creators">
                  <div className="flex flex-col">
                    {people.map((person) => (
                      <CreatorRow key={person.id} person={person} />
                    ))}
                  </div>
                </Section>
              )}
              {newPeople.length > 0 && (
                <Section eyebrow="Say hi first" title="New this week">
                  <div className="flex flex-col">
                    {newPeople.map((person) => (
                      <CreatorRow key={person.id} person={person} />
                    ))}
                  </div>
                </Section>
              )}
            </>
          ) : (
            <EmptyState
              icon={Compass}
              title="No suggestions yet"
              text="As you follow people and post, your circle fills up here."
            />
          ))}

        {cat === "Tags" &&
          (tags.length > 0 ? (
            <div className="flex flex-col pt-2">
              {tags.map((t) => (
                <Link
                  key={t.tag}
                  href={`/search?q=%23${encodeURIComponent(t.tag)}`}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03]"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface">
                    <Hash size={18} className="text-hashtag" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">#{t.tag}</p>
                    <p className="truncate text-xs text-muted">
                      {t.count} {t.count === 1 ? "post" : "posts"}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState icon={Hash} title="No tags trending" text="Throw #tags on your posts and start a wave." />
          ))}
      </div>
    </>
  );
}

function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="pt-5">
      {eyebrow && (
        <p className="px-4 text-[10px] font-bold uppercase tracking-widest text-faint">
          {eyebrow}
        </p>
      )}
      <h2
        className={`px-4 pb-2.5 text-[17px] font-extrabold tracking-tight ${
          eyebrow ? "pt-0.5" : "pt-1"
        }`}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Stat({ icon, value }: { icon: React.ReactNode; value: number }) {
  return (
    <span className="flex items-center gap-1 text-xs font-semibold text-white drop-shadow">
      {icon} {formatCount(value)}
    </span>
  );
}

function ShotTile({ shot }: { shot: Shot }) {
  return (
    <Link
      href={`/shots/${shot.id}`}
      className="relative block aspect-[9/16] overflow-hidden rounded-[10px] bg-black"
    >
<ShotPreview
        id={shot.id}
        src={shot.media_url}
        poster={shot.poster_url}
        alt={shot.caption ?? "Shot"}
        className="h-full w-full object-cover"
      />
      <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
        <Play size={9} className="fill-white" /> Shot
      </span>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/70 to-transparent p-2.5 pt-6">
        <Stat icon={<Zap size={12} className="fill-accent text-accent" />} value={shot.hype_count} />
        <Stat icon={<MessageCircle size={12} />} value={shot.comment_count} />
      </div>
    </Link>
  );
}

function CreatorRow({ person }: { person: Person }) {
  return (
    <UserSuggestionCard
      user={{
        id: person.id,
        name: person.display_name ?? person.username ?? "User",
        handle: person.username ? `@${person.username}` : "",
        hue: person.avatar_hue ?? 280,
        avatarUrl: person.avatar_url ?? null,
        verified: !!person.is_verified,
      }}
    />
  );
}
