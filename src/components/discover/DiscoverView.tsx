"use client";

import { useState } from "react";
import Link from "next/link";
import { Zap, MessageCircle, Play, Compass, Hash } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { UserSuggestionCard } from "@/components/discover/UserSuggestionCard";
import { formatCount } from "@/lib/format";

type Post = {
  id: string; caption: string | null; body: string | null;
  image_url: string | null; image_urls: string[] | null;
  hype_count: number; comment_count: number;
  profiles: { display_name: string | null; username: string | null; avatar_hue: number | null } | null;
};
type Shot = {
  id: string; media_url: string; poster_url: string | null; caption: string | null;
  hype_count: number; comment_count: number;
  profiles: { display_name: string | null; username: string | null; avatar_hue: number | null } | null;
};
type Person = { id: string; display_name: string | null; username: string | null; avatar_hue: number | null; avatar_url?: string | null };
type Tag = { tag: string; count: number };

const CATEGORIES = ["For You", "Blowing Up", "Posts", "Shots", "Creators", "Tags"] as const;
type Cat = (typeof CATEGORIES)[number];

function postImage(p: Post): string | null {
  return p.image_urls?.[0] ?? p.image_url ?? null;
}

export function DiscoverView({
  trendingPosts, freshPosts, trendingShots, people, tags,
}: {
  currentUserId: string;
  trendingPosts: Post[];
  freshPosts: Post[];
  trendingShots: Shot[];
  people: Person[];
  tags: Tag[];
}) {
  const [cat, setCat] = useState<Cat>("For You");
  const allPosts = [...trendingPosts, ...freshPosts];

  const everythingEmpty =
    trendingPosts.length === 0 && freshPosts.length === 0 && trendingShots.length === 0 && people.length === 0;

  if (everythingEmpty) {
    return (
      <EmptyState icon={Compass} title="Nothing here yet" text="Hypefy gets better as more people join. Check back soon." />
    );
  }

  return (
    <>
      {/* Category chips */}
      <div className="no-scrollbar sticky top-14 z-10 flex gap-2 overflow-x-auto bg-background/90 px-4 py-2.5 backdrop-blur-xl">
        {CATEGORIES.map((c) => (
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

      <div className="pb-6">
        {cat === "For You" && (
          <>
            {tags.length > 0 && <TagRail tags={tags} />}
            {trendingShots.length > 0 && (
              <Section title="Shots">
                <div className="no-scrollbar flex gap-2.5 overflow-x-auto px-4">
                  {trendingShots.map((s) => <div key={s.id} className="w-32 shrink-0"><ShotTile shot={s} /></div>)}
                </div>
              </Section>
            )}
            {trendingPosts.length > 0 && (
              <Section title="Blowing up ðŸ”¥">
                <div className="no-scrollbar flex gap-2.5 overflow-x-auto px-4">
                  {trendingPosts.map((p) => <div key={p.id} className="w-40 shrink-0"><PostTile post={p} /></div>)}
                </div>
              </Section>
            )}
            {people.length > 0 && (
              <Section title="Creators to Hype">
                <div className="flex flex-col">
                  {people.slice(0, 5).map((person) => <CreatorRow key={person.id} person={person} />)}
                </div>
              </Section>
            )}
            {freshPosts.length > 0 && (
              <Section title="Fresh">
                <Grid>{freshPosts.map((p) => <PostTile key={p.id} post={p} />)}</Grid>
              </Section>
            )}
          </>
        )}

        {cat === "Blowing Up" && (
          <Section title="Blowing up ðŸ”¥">
            <Grid>{trendingPosts.map((p) => <PostTile key={p.id} post={p} />)}</Grid>
          </Section>
        )}

        {cat === "Posts" && (
          <Section title="All posts">
            <Grid>{allPosts.map((p) => <PostTile key={p.id} post={p} />)}</Grid>
          </Section>
        )}

        {cat === "Shots" && (
          trendingShots.length > 0 ? (
            <Section title="Shots">
              <div className="grid grid-cols-2 gap-2.5 px-4 sm:grid-cols-3">
                {trendingShots.map((s) => <ShotTile key={s.id} shot={s} />)}
              </div>
            </Section>
          ) : <EmptyState icon={Play} title="No Shots yet" text="Post a Shot to start the feed." />
        )}

        {cat === "Creators" && (
          people.length > 0 ? (
            <div className="flex flex-col pt-2">
              {people.map((person) => <CreatorRow key={person.id} person={person} />)}
            </div>
          ) : <EmptyState icon={Compass} title="No creators yet" text="Check back as more people join." />
        )}

        {cat === "Tags" && (
          tags.length > 0 ? (
            <div className="flex flex-col pt-2">
              {tags.map((t) => (
                <Link key={t.tag} href={`/search?q=%23${encodeURIComponent(t.tag)}`}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03]">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface">
                    <Hash size={18} className="text-accent" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">#{t.tag}</p>
                    <p className="truncate text-xs text-muted">{t.count} {t.count === 1 ? "post" : "posts"}</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : <EmptyState icon={Hash} title="No tags yet" text="Add #tags to your posts to see them here." />
        )}
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="px-4 pb-2 pt-4 text-base font-bold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2.5 px-4">{children}</div>;
}

function TagRail({ tags }: { tags: Tag[] }) {
  return (
    <Section title="Trending tags">
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4">
        {tags.map(({ tag, count }) => (
          <Link key={tag} href={`/search?q=%23${encodeURIComponent(tag)}`}
            className="flex shrink-0 flex-col rounded-2xl border border-border bg-surface px-4 py-2.5">
            <span className="text-sm font-bold text-accent">#{tag}</span>
            <span className="text-xs text-muted">{count} {count === 1 ? "post" : "posts"}</span>
          </Link>
        ))}
      </div>
    </Section>
  );
}

function Stat({ icon, value }: { icon: React.ReactNode; value: number }) {
  return (
    <span className="flex items-center gap-1 text-xs font-semibold text-white drop-shadow">
      {icon} {formatCount(value)}
    </span>
  );
}

function PostTile({ post }: { post: Post }) {
  const img = postImage(post);
  const hue = post.profiles?.avatar_hue ?? 280;
  return (
    <Link href={`/p/${post.id}`} className="group relative block aspect-square overflow-hidden rounded-2xl bg-surface">
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt={post.caption ?? "Post"} loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-end p-3" style={{ background: `linear-gradient(140deg, hsl(${hue} 55% 22%), #141414)` }}>
          <p className="line-clamp-4 text-xs font-medium text-white/90">{post.caption ?? post.body ?? ""}</p>
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/70 to-transparent p-2.5 pt-6">
        <Stat icon={<Zap size={12} className="fill-accent text-accent" />} value={post.hype_count} />
        <Stat icon={<MessageCircle size={12} />} value={post.comment_count} />
      </div>
    </Link>
  );
}

function ShotTile({ shot }: { shot: Shot }) {
  return (
    <Link href={`/shots/${shot.id}`} className="relative block aspect-[3/4] overflow-hidden rounded-2xl bg-black">
      {shot.poster_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={shot.poster_url} alt={shot.caption ?? "Shot"} loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : (
        <video src={shot.media_url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
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
        verified: false,
      }}
    />
  );
}
