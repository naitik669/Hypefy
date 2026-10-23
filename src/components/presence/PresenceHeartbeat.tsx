"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { presenceTopic } from "@/lib/presence";

/**
 * Keeps the signed-in user's `last_seen_at` fresh so others can show an
 * online dot / "Active Nm ago", and tells anyone watching, directly.
 *
 * Touches on mount, every 60s, and whenever the tab becomes visible or the
 * network reconnects. No UI.
 *
 * The broadcast is the part that makes presence live. A DM used to watch for
 * `postgres_changes` on `profiles`, which never fired — profiles is not in
 * the realtime publication, and putting it there would mean one WAL record
 * per user per minute, decoded and RLS-checked for every subscriber, to
 * carry the message "still here" (see 0155 and 0156). Announcing it on a
 * channel costs the database nothing, and it is how the typing indicator in
 * the same conversation already works.
 *
 * `touch_last_seen` returns what it stored, which is null for a reader whose
 * activity is hidden. Nothing is announced for them — the opt-out has to hold
 * on both paths, or the dot would come back by the side door.
 */
export function PresenceHeartbeat({ userId }: { userId: string }) {
  useEffect(() => {
    const supabase = createClient();
    let alive = true;

    // Our own topic, subscribed so we can send on it. Whoever has our chat
    // open is listening to the same name.
    const channel = supabase.channel(presenceTopic(userId));
    channel.subscribe();

    const beat = () => {
      if (document.visibilityState !== "visible") return;
      void supabase.rpc("touch_last_seen").then(({ data, error }) => {
        if (!alive || error || !data) return;
        void channel.send({
          type: "broadcast",
          event: "beat",
          // The stored value, not this device's clock, so a skewed phone
          // cannot report itself as active in the future.
          payload: { at: data as string },
        });
      });
    };

    beat();
    const interval = setInterval(beat, 60_000);
    const onVisible = () => { if (alive) beat(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);

    return () => {
      alive = false;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  return null;
}
