"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Compass, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { InterestSheet } from "@/components/profile/InterestSheet";
import { hasUsedTheFeed } from "@/lib/feed-seen";

const SNOOZE_KEY = "hypefy_interest_nudge_snooze";

function today() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * Asks for interests once the feed is worth personalising.
 *
 * Not an onboarding step, deliberately: setup is already four screens before
 * anyone reaches the feed, and interests only mean something once you have
 * seen what the feed currently gives you.
 *
 * "Once it is worth it" is two signals that already exist, ANDed:
 *   - the seen-post ring has 25+ entries, so they have actually scrolled a
 *     feed rather than opened the app once;
 *   - the account is over a day old.
 * No session counter, no new storage key beyond the snooze.
 *
 * Snooze is checked before any query, so a dismissed nudge costs nothing.
 */
export function InterestNudge() {
  const supabase = createClient();
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(SNOOZE_KEY) === today()) return;
    } catch {
      return;
    }

    if (!hasUsedTheFeed()) return;

    let active = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !active) return;

      const { data: prof } = await supabase
        .from("profiles")
        .select("interests, created_at")
        .eq("id", user.id)
        .maybeSingle();
      if (!active || !prof) return;

      // Already answered — the ranker has what it needs.
      if (((prof as any).interests?.length ?? 0) > 0) return;

      const ageMs = Date.now() - new Date((prof as any).created_at).getTime();
      if (ageMs < 24 * 60 * 60 * 1000) return;

      setVisible(true);
    })();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function snooze() {
    try {
      localStorage.setItem(SNOOZE_KEY, today());
    } catch {
      /* private mode — it just reappears tomorrow */
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <>
      <div className="flex items-center gap-3 border-b border-border/60 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
            <Compass size={16} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm leading-tight font-semibold">
              What are you into?
            </span>
            {/* Deliberately modest. The interest term is one input among
                several, and promising a transformed feed writes a cheque the
                ranker cannot cash. */}
            <span className="block truncate text-xs text-muted">
              Pick a few topics to shape what lands here.
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={snooze}
          aria-label="Not now"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-foreground"
        >
          <X size={16} />
        </button>
      </div>

      <InterestSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        initial={[]}
        onSaved={(next) => {
          snooze();
          // The action revalidates /home; this pulls the new order in.
          if (next.length) router.refresh();
        }}
      />
    </>
  );
}
