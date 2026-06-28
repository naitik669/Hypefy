"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Keeps the signed-in user's `last_seen_at` fresh so others can show an
 * online dot / "Active Nm ago". Touches on mount, every 60s, and whenever
 * the tab becomes visible or the network reconnects. No UI.
 */
export function PresenceHeartbeat() {
  useEffect(() => {
    const supabase = createClient();
    let alive = true;
    const beat = () => {
      if (document.visibilityState !== "visible") return;
      supabase.rpc("touch_last_seen").then(() => {});
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
    };
  }, []);

  return null;
}
