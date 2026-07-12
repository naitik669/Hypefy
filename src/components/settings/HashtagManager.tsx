"use client";

import { useState } from "react";
import Link from "next/link";
import { Hash, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/ToastProvider";

/**
 * "Topics you follow" manager — lists the viewer's hashtag_follows with an
 * unfollow control on each, and taps through to that tag's search results.
 */
export function HashtagManager({ tags }: { tags: string[] }) {
  const supabase = createClient();
  const toast = useToast();
  const [list, setList] = useState<string[]>(tags);
  const [busy, setBusy] = useState<string | null>(null);

  async function unfollow(tag: string) {
    if (busy) return;
    setBusy(tag);
    const prev = list;
    setList((l) => l.filter((t) => t !== tag)); // optimistic
    // toggle_hashtag_follow flips state; since we're following, this unfollows.
    const { error } = await supabase.rpc("toggle_hashtag_follow", { p_tag: tag });
    setBusy(null);
    if (error) {
      setList(prev); // rollback
      toast("Couldn't update topic", "error");
    }
  }

  if (list.length === 0) {
    return (
      <EmptyState
        icon={Hash}
        title="No topics yet"
        text="Follow a #hashtag from search to see it here."
      />
    );
  }

  return (
    <div className="flex flex-col gap-2 px-4 pt-2 pb-10">
      {list.map((tag) => (
        <div
          key={tag}
          className="flex items-center gap-3 rounded-2xl bg-surface px-3.5 py-3"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-hashtag/15 text-hashtag">
            <Hash size={17} />
          </span>
          <Link
            href={`/search?q=${encodeURIComponent(`#${tag}`)}`}
            className="min-w-0 flex-1 truncate text-sm font-semibold hover:underline"
          >
            #{tag}
          </Link>
          <button
            type="button"
            onClick={() => unfollow(tag)}
            disabled={busy === tag}
            className="flex shrink-0 items-center gap-1 rounded-pill border border-border px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-white/25 hover:text-foreground disabled:opacity-50"
          >
            <X size={13} /> Unfollow
          </button>
        </div>
      ))}
    </div>
  );
}
