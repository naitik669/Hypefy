"use client";

import { useState } from "react";
import Link from "next/link";
import { Zap, MessageCircle, Play, Compass, Hash } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { UserSuggestionCard } from "@/components/discover/UserSuggestionCard";
import { PinFeed, type Pin } from "@/components/discover/PinFeed";
import { formatCount } from "@/lib/format";

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

const FIXED = ["For You", "Blowing Up", "Shots", "People", "Tags"] as const;

/**
 * Discover, laid out like Pinterest.
 *
 * It used to be a stack of sections — trending tags, a Shots rail, a
 * "Blowing up" grid, an interests rail, creators, six topic rails and a
 * "Fresh" grid that ended in a Show more button. Each was reasonable on its
 * own; together they made Discover a page you read down rather than one you
 * browse, and every rail was a sideways scroll inside a vertical one.
 *
 * Now For You is one thing: the Shots rail on top, as before, and under it a
 * single ranked masonry of posts that carries on by itself as you scroll.
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
  people: Person[];
  newPeople?: Person[];
  categoryRails?: { label: string; posts: Pin[] }[];
  tags: Tag[];
}) {
  const chips = [...FIXED, ...categoryRails.map((c) => c.label)];
  const [cat, setCat] = useState<string>("For You");

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
      {/* Chips — soft fade at the right edge hints there's more */}
      <div className="sticky top-14 z-10 bg-background/90 backdrop-blur-xl">
        <div
          className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-2.5"
          style={{
            maskImage: "linear-gradient(to right, black 92%, transparent)",
          }}
        >
          {chips.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCat(c)}
              className={`shrink-0 rounded-pill px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                cat === c ? "bg-accent text-accent-ink" : "bg-surface text-muted"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div key={cat} className="animate-fade-swap pb-6">
        {cat === "For You" && (
          <>
            {trendingShots.length > 0 && (
              <Section eyebrow="Watch" title="Trending Shots">
                <div className="no-scrollbar flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-4">
                  {trendingShots.map((s) => (
                    <div key={s.id} className="w-36 shrink-0 snap-start">
                      <ShotTile shot={s} />
                    </div>
                  ))}
                </div>
              </Section>
            )}
            <div className="pt-5">
              <PinFeed
                posts={rankedPosts}
                currentUserId={currentUserId}
                endless={{ cursor: feedCursor, blockedIds }}
              />
            </div>
          </>
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

        {cat === "Shots" &&
          (trendingShots.length > 0 ? (
            <Section title="Shots">
              <div className="grid grid-cols-3 gap-3 px-4">
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
      className="relative block aspect-[9/16] overflow-hidden rounded-2xl bg-black"
    >
      {shot.poster_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={shot.poster_url}
          alt={shot.caption ?? "Shot"}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      ) : (
        // #t=0.1 forces a decoded frame; preload="metadata" alone is not
        // obliged to produce one and Safari does not.
        <video
          src={`${shot.media_url}#t=0.1`}
          muted
          playsInline
          preload="metadata"
          className="h-full w-full object-cover"
        />
      )}
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
