"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Compass, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { InterestSheet } from "@/components/profile/InterestSheet";
import { hasUsedTheFeed } from "@/lib/feed-seen";
import { INTERESTS } from "@/lib/profile";
import { updateInterests } from "@/app/(app)/settings/profile/actions";
import { useToast } from "@/components/ui/ToastProvider";
import { haptics } from "@/lib/haptics";

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
 * Gated on the seen-post ring having 25+ entries and the account being over a
 * day old. Worth knowing what that gate actually does: FeedList bulk-adds all
 * 30 ranked ids to the ring on the FIRST feed load, so the 25 is cleared
 * immediately and only the 24-hour rule really bites. It was written as
 * "they have scrolled a feed"; it means "they have opened one".
 *
 * That matters because it rules out the obvious explanation for zero uptake —
 * the nudge is not gated shut, it is being seen and ignored. The friction is
 * in the asking, which is why the chips are inline below.
 *
 * Snooze is checked before any query, so a dismissed nudge costs nothing.
 */
/**
 * The handful offered inline. Six is what fits two rows on a phone without
 * the nudge becoming taller than the post beneath it; the rest are one tap
 * away behind "More".
 */
const QUICK = INTERESTS.slice(0, 6);

export function InterestNudge() {
  const supabase = createClient();
  const router = useRouter();
  const toast = useToast();
  const [visible, setVisible] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  function save() {
    haptics.tap();
    startTransition(async () => {
      const res = await updateInterests(picked);
      if ("error" in res) {
        toast("Couldn't save that", "error");
        return;
      }
      haptics.success();
      toast("Feed updated", "success");
      snooze();
      // The action revalidates /home; this pulls the new order in.
      router.refresh();
    });
  }

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
      {/*
        Answerable in place.

        This was a one-line strip that opened a sheet — three steps between
        seeing the question and having answered it (tap the row, pick pills,
        press Save). It has been shown daily to every weekly active for weeks
        and produced zero answers out of 17 accounts. The gate was never the
        problem: the seen ring is bulk-filled on the first feed load, so it
        opens immediately.

        The chips are here now, so one tap is an answer. "More" still opens
        the full sheet for anyone who wants the rest.
      */}
      <div className="border-b border-border/60 px-4 py-3">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
            <Compass size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-tight font-semibold">
              What are you into?
            </p>
            {/* Deliberately modest. The interest term is one input among
                several, and promising a transformed feed writes a cheque the
                ranker cannot cash. */}
            <p className="mt-0.5 text-xs text-muted">
              Tap a topic — posts tagged with it get lifted here.
            </p>
          </div>
          <button
            type="button"
            onClick={snooze}
            aria-label="Not now"
            className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-2.5 flex flex-wrap gap-1.5 pl-[42px]">
          {QUICK.map((t) => {
            const on = picked.includes(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => {
                  haptics.select();
                  setPicked((p) =>
                    p.includes(t) ? p.filter((x) => x !== t) : [...p, t]
                  );
                }}
                className={`rounded-pill border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  on
                    ? "border-accent bg-accent text-accent-ink"
                    : "border-border bg-surface text-muted hover:text-foreground"
                }`}
              >
                {t}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="rounded-pill border border-border px-3 py-1.5 text-xs font-semibold text-faint transition-colors hover:text-foreground"
          >
            More…
          </button>
        </div>

        {picked.length > 0 && (
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="animate-row-in mt-2.5 ml-[42px] flex h-9 items-center justify-center rounded-pill bg-accent px-5 text-xs font-extrabold text-accent-ink transition-transform active:scale-95 disabled:opacity-60"
          >
            {pending ? "Saving…" : `Save ${picked.length}`}
          </button>
        )}
      </div>

      <InterestSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        initial={picked}
        onSaved={(next) => {
          snooze();
          // The action revalidates /home; this pulls the new order in.
          if (next.length) router.refresh();
        }}
      />
    </>
  );
}
