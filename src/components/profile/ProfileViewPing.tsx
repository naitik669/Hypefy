"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Records that somebody looked at this profile.
 *
 * Client-side on purpose, the same reason ViewPing is: a server render
 * fires on route prefetch, so counting there would count profiles nobody
 * ever arrived at. Next prefetches links in the viewport, which on a feed
 * is every author whose post you scrolled past.
 *
 * The function behind this drops a view of your own profile and dedupes to
 * one row per visitor per day, so the ref here is only to stop a re-render
 * making a second round trip — the correctness lives in the database, not
 * in this component's memory.
 *
 * Failures are swallowed. Nothing about looking at a profile should be
 * able to produce an error in front of the person looking at it.
 */
export function ProfileViewPing({ profileId }: { profileId: string }) {
  const sent = useRef<string | null>(null);

  useEffect(() => {
    if (!profileId || sent.current === profileId) return;
    sent.current = profileId;
    const supabase = createClient();
    void supabase.rpc("record_profile_view", { p_profile_id: profileId }).then(() => {});
  }, [profileId]);

  return null;
}
