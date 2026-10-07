"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, Plus, Share2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/ToastProvider";
import { haptics } from "@/lib/haptics";

/**
 * Follow a tag, and share its page.
 *
 * Following a tag is a feed preference: posts under it rank higher for you
 * (the ranker reads hashtag_follows). The list lives in Settings, under
 * Topics you follow.
 */
export function TagActions({
  tag,
  initialFollowing,
  signedIn,
}: {
  tag: string;
  initialFollowing: boolean;
  signedIn: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, setPending] = useState(false);

  async function toggle() {
    if (pending) return;
    setPending(true);
    const was = following;
    setFollowing(!was);
    haptics.select();
    // The function flips the follow and answers with where it ended up.
    const { data, error } = await supabase.rpc("toggle_hashtag_follow", { p_tag: tag });
    setPending(false);
    if (error) {
      setFollowing(was);
      toast("Couldn't update that. Try again.", "error");
      return;
    }
    const now = data === true;
    setFollowing(now);
    toast(now ? `Following #${tag}. More of it in your feed.` : `Unfollowed #${tag}`, "success");
  }

  async function share() {
    const url = `${window.location.origin}/tag/${encodeURIComponent(tag)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `#${tag} on Hypefy`, url });
        return;
      }
    } catch {
      // Closed the share sheet without choosing: nothing to say.
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied", "success");
    } catch {
      toast("Couldn't copy that link", "error");
    }
  }

  return (
    <div className="flex gap-2">
      {signedIn ? (
        <button
          type="button"
          onClick={toggle}
          aria-pressed={following}
          data-tag-follow
          className={`flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl text-sm font-extrabold transition-transform active:scale-[0.99] ${
            following ? "border border-border text-foreground" : "bg-accent text-accent-ink"
          }`}
        >
          {following ? <Check size={16} strokeWidth={2.6} /> : <Plus size={17} strokeWidth={2.6} />}
          {following ? "Following" : "Follow tag"}
        </button>
      ) : (
        <Link
          href="/onboarding"
          className="flex h-11 flex-1 items-center justify-center rounded-2xl bg-accent text-sm font-extrabold text-accent-ink"
        >
          Join to follow this tag
        </Link>
      )}
      <button
        type="button"
        onClick={share}
        aria-label={`Share #${tag}`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border text-foreground"
      >
        <Share2 size={17} />
      </button>
    </div>
  );
}
