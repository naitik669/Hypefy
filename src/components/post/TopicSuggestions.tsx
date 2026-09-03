"use client";

import { useEffect, useState } from "react";
import { Hash } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { haptics } from "@/lib/haptics";

/**
 * Tappable topic chips under the caption field.
 *
 * The composer already had a `#` autocomplete, and it made no difference:
 * 1 of 32 posts carries a hashtag. An autocomplete only helps someone who has
 * already decided to type `#`, and almost nobody does. This asks instead.
 *
 * It matters beyond tidiness — `tagAffinity` in the feed ranker scores posts
 * by hashtag overlap, so with no hashtags anywhere that term is permanently
 * zero and the feed cannot personalise on topic at all.
 *
 * Seeded from the user's own interests and profile tags, NOT from trending.
 * Trending is circular here: get_trending_tags returns an empty set precisely
 * because nothing is tagged yet, so seeding from it would suggest nothing to
 * exactly the accounts that need the prompt. Trending is used when it has
 * something to say, and the user's own topics carry it until then.
 */
export function TopicSuggestions({
  caption,
  onPick,
}: {
  caption: string;
  onPick: (tag: string) => void;
}) {
  const [topics, setTopics] = useState<string[]>([]);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !active) return;

      const [{ data: prof }, { data: trending }] = await Promise.all([
        supabase
          .from("profiles")
          .select("interests, profile_tags")
          .eq("id", user.id)
          .maybeSingle(),
        supabase.rpc("get_trending_tags", { p_limit: 6 }),
      ]);
      if (!active) return;

      const fromTrending = ((trending as any[]) ?? []).map((t) =>
        String(t.tag ?? "").toLowerCase()
      );
      const mine = [
        ...(((prof as any)?.interests as string[]) ?? []),
        ...(((prof as any)?.profile_tags as string[]) ?? []),
      ].map((t) => t.toLowerCase().replace(/[^a-z0-9]/g, ""));

      // Trending first when it exists, then the user's own topics.
      setTopics(
        [...new Set([...fromTrending, ...mine])].filter(Boolean).slice(0, 8)
      );
    })();

    return () => {
      active = false;
    };
  }, []);

  // Never offer a tag the caption already carries.
  const lower = caption.toLowerCase();
  const available = topics.filter((t) => !lower.includes(`#${t}`));

  if (available.length === 0) return null;

  return (
    <div className="mt-2">
      <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold tracking-wider text-faint uppercase">
        <Hash size={11} /> Add a topic
      </p>
      <div className="flex flex-wrap gap-1.5">
        {available.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              haptics.select();
              onPick(t);
            }}
            className="rounded-pill border border-border bg-surface px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:text-foreground"
          >
            #{t}
          </button>
        ))}
      </div>
    </div>
  );
}
