"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Invisible view-counter: bumps posts.view_count once per mount via the
 * increment_post_view RPC. Client-side on purpose — server renders fire on
 * route prefetch and would inflate the numbers.
 */
export function ViewPing({ postId }: { postId: string }) {
  const sent = useRef<string | null>(null);

  useEffect(() => {
    if (!postId || sent.current === postId) return;
    sent.current = postId;
    const supabase = createClient();
    supabase.rpc("increment_post_view", { p_post_id: postId }).then(() => {});
  }, [postId]);

  return null;
}
