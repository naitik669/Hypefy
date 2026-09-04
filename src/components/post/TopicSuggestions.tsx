"use client";

import { useEffect, useState } from "react";
import { Hash } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { haptics } from "@/lib/haptics";
import { INTERESTS } from "@/lib/profile";

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
 * Four sources, in falling order of how much they know about this author:
 * trending, the tags they have used before, the interests and profile tags
 * they set, and a static starter list.
 *
 * Every one of the first three is circular for a new or quiet account.
 * get_trending_tags returns an empty set precisely BECAUSE nothing is tagged;
 * interests are unset for most people; a first post has no history. And this
 * component returns null when it has nothing — so the accounts most in need
 * of the prompt were the exact ones never shown it, which is how hashtags
 * stayed at 1 post in 31 with the picker already mounted.
 *
 * The starters exist to break that. They are the only source that cannot be
 * empty.
 */
/**
 * Last-resort vocabulary, so this component is never empty.
 *
 * Drawn from INTERESTS in lib/profile.ts so the words people can pick as
 * interests and the words they can tag posts with are the same vocabulary —
 * otherwise the interest term in the ranker matches against tags that do not
 * exist. Lowercased and stripped to the hashtag form here.
 */
const STARTERS = INTERESTS.slice(0, 8).map((t) =>
  t.toLowerCase().replace(/[^a-z0-9]/g, "")
);

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

      const [{ data: prof }, { data: trending }, { data: myPosts }] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("interests, profile_tags")
            .eq("id", user.id)
            .maybeSingle(),
          supabase.rpc("get_trending_tags", { p_limit: 6 }),
          // Tags this author has used before. The strongest suggestion
          // available, and the only source here that does not depend on
          // anyone having filled in a form.
          supabase
            .from("posts")
            .select("hashtags")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(20),
        ]);
      if (!active) return;

      const clean = (t: unknown) =>
        String(t ?? "")
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "");

      const fromTrending = ((trending as any[]) ?? []).map((t) =>
        clean(t.tag)
      );
      const fromMyPosts = ((myPosts as any[]) ?? []).flatMap((p) =>
        ((p.hashtags as string[]) ?? []).map(clean)
      );
      const mine = [
        ...(((prof as any)?.interests as string[]) ?? []),
        ...(((prof as any)?.profile_tags as string[]) ?? []),
      ].map(clean);

      // Trending when it has something to say, then what this author already
      // uses, then what they told us about themselves, then the starters.
      //
      // The starters are what breaks the loop. Every other source is empty
      // for a new account, and this component returns null when it has
      // nothing — so the accounts most in need of the prompt were the exact
      // ones never shown it. That kept hashtags at 1 post in 31, which keeps
      // the ranker's tag term permanently at zero.
      setTopics(
        [...new Set([...fromTrending, ...fromMyPosts, ...mine, ...STARTERS])]
          .filter(Boolean)
          .slice(0, 8)
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
