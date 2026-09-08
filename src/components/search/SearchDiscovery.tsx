"use client";

import { useEffect, useState } from "react";
import { Clock, X, Hash } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PeopleToFollow } from "@/components/feed/PeopleToFollow";
import { formatCount } from "@/lib/format";

export type TopicCard = {
  tag: string;
  post_count: number;
  recent_count: number;
  cover_url: string | null;
};

/**
 * Browsable categories.
 *
 * Curated and hardcoded on purpose. Categories derived from whatever people
 * have posted are circular — a young app has four hashtags, so the derived
 * categories would be those four, and nobody discovers anything they were not
 * already going to find. These are the shape of the app someone is joining,
 * and each one runs a real search, so none of them is a dead end.
 *
 * The label IS the query. No mapping table to drift out of sync, and the
 * search itself matches captions, bodies and the tag, so "music" finds the
 * #music posts and the ones that only talk about it.
 */
const CATEGORIES = [
  "Music",
  "Art",
  "Gaming",
  "Food",
  "Fashion",
  "Travel",
  "Fitness",
  "Photography",
  "Tech",
  "Memes",
];

/**
 * Everything the search screen shows BEFORE anyone types.
 *
 * It used to be a list of recent searches and a row of trending chips, and
 * trending comes from a 24-hour window, so most of the time it was one empty
 * heading under another. A search box that opens onto nothing tells you to go
 * away and come back with a question already formed.
 */
export function SearchDiscovery({
  currentUserId,
  recent,
  onSearch,
  onRemoveRecent,
  onClearRecent,
}: {
  currentUserId: string;
  recent: string[];
  /** Runs the search, exactly as typing the term and pressing enter would. */
  onSearch: (term: string) => void;
  onRemoveRecent: (term: string) => void;
  onClearRecent: () => void;
}) {
  const [topics, setTopics] = useState<TopicCard[] | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.rpc("get_topic_cards", { p_limit: 12 }).then(({ data }) => {
      setTopics((data ?? []) as TopicCard[]);
    });
  }, []);

  return (
    <div className="flex flex-col gap-7 px-4 py-4">
      {recent.length > 0 && (
        <section>
          <div className="mb-1 flex items-center justify-between">
            <Heading>Recent</Heading>
            <button
              type="button"
              onClick={onClearRecent}
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
                  onClick={() => onSearch(term)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-muted">
                    <Clock size={16} />
                  </span>
                  <span className="truncate text-sm">{term}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveRecent(term)}
                  aria-label={`Remove "${term}" from recent searches`}
                  className="shrink-0 p-1.5 text-faint transition-colors hover:text-foreground"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Topics — real ones, with real covers. Rendered only when the app
          actually has some, because four empty frames under a heading is
          worse than not asking the question. */}
      {topics !== null && topics.length > 0 && (
        <section>
          <Heading>Topics right now</Heading>
          {/* Bleeds to the screen edge so the row reads as scrollable — a
              carousel that stops inside the page margin looks like a grid
              that failed to fill. */}
          {/* scroll-px-4 is load-bearing: scroll-snap aligns a snap-start
              child to the SCROLLPORT edge, which ignores padding, so the
              carousel silently parked itself 16px in and clipped the first
              card against the screen edge. */}
          <div className="-mx-4 mt-2 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {topics.map((t) => (
              <button
                key={t.tag}
                type="button"
                onClick={() => onSearch(`#${t.tag}`)}
                className="group relative h-[132px] w-[162px] shrink-0 snap-start overflow-hidden rounded-card border border-border bg-elevated text-left transition-transform active:scale-[0.97]"
              >
                {t.cover_url ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={t.cover_url}
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                    {/* The label has to stay readable over a photograph
                        nobody vetted, so the scrim is opaque at the bottom
                        rather than a gentle wash over the whole card. */}
                    <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
                  </>
                ) : (
                  // No picture in this topic yet. A big glyph rather than a
                  // stand-in gradient: it says "text topic", not "image
                  // missing".
                  <span className="absolute inset-0 flex items-center justify-center text-faint">
                    <Hash size={44} strokeWidth={2.5} />
                  </span>
                )}
                <span className="absolute inset-x-0 bottom-0 p-3">
                  <span className="block truncate text-sm font-extrabold text-white drop-shadow">
                    #{t.tag}
                  </span>
                  <span className="block text-[11px] font-semibold text-white/70">
                    {formatCount(t.post_count)}{" "}
                    {t.post_count === 1 ? "post" : "posts"}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <Heading>Browse</Heading>
        <div className="mt-2 grid grid-cols-2 gap-2.5">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onSearch(c.toLowerCase())}
              className="flex h-[52px] items-center justify-between gap-2 rounded-2xl border border-border bg-elevated px-3.5 text-left text-sm font-bold text-foreground transition-colors active:bg-surface"
            >
              <span className="truncate">{c}</span>
              <Hash size={15} className="shrink-0 text-faint" />
            </button>
          ))}
        </div>
      </section>

      {currentUserId && (
        <section>
          <PeopleToFollow
            currentUserId={currentUserId}
            heading="People to follow"
            sub="Based on who you already follow."
          />
        </section>
      )}
    </div>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-bold uppercase tracking-widest text-faint">
      {children}
    </h2>
  );
}
