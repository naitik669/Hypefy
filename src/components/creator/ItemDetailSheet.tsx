"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { formatCount } from "@/lib/format";
import { itemHref, itemTitle, viewsPerPerson, type ItemKind } from "@/lib/creator-insights";
import {
  interactionRate,
  num,
  shareTarget,
  watchTime,
  SHARE_DESTINATIONS,
  type ItemRow,
} from "@/lib/creator-content";

type Watch = {
  watchers?: number;
  avg_completion?: number;
  finished?: number;
  total_watch_ms?: number;
  replays?: number;
};

/**
 * Everything known about one post or Shot.
 *
 * Opened from the content list rather than being a route, because it is
 * read next to the list it came from — you compare two posts by opening
 * one, closing it and opening the other, and a route makes that two page
 * loads.
 *
 * The two slower numbers are fetched when it opens, not with the list:
 * share_breakdown and shot_watch_summary are a query each per item, and
 * fifty of them to fill a list nobody has tapped is fifty queries wasted.
 */
export function ItemDetailSheet({ item, onClose }: { item: ItemRow | null; onClose: () => void }) {
  const supabase = createClient();
  // Keyed by the item it was fetched for, rather than cleared when the
  // item changes: a reset written into the effect is setState during an
  // effect, and the question it answers — "is what I hold about the thing
  // on screen?" — is answered by comparing the two ids instead.
  const [loaded, setLoaded] = useState<{
    id: string;
    shares: Record<string, number>;
    watch: Watch | null;
  } | null>(null);

  // The item is held on after the caller clears it, so the sheet still has
  // something to draw while it slides out. BottomSheet keeps itself on
  // screen for the length of its exit and cannot if the content unmounts
  // underneath it — adjusted during the render that learns about the prop,
  // which is what BottomSheet does with the same problem one level up.
  const [last, setLast] = useState<ItemRow | null>(item);
  if (item && item !== last) setLast(item);
  const shown = item ?? last;

  const id = shown?.id ?? null;
  const kind = shown?.kind ?? null;

  useEffect(() => {
    if (!id || !kind) return;
    let active = true;
    (async () => {
      const [shareRes, watchRes] = await Promise.all([
        supabase.rpc("share_breakdown", {
          p_target_type: shareTarget(kind),
          p_target_id: id,
        }),
        kind === "shot"
          ? supabase.rpc("shot_watch_summary", { p_shot_id: id })
          : Promise.resolve({ data: null }),
      ]);
      if (!active) return;
      setLoaded({
        id,
        shares: (shareRes.data ?? {}) as Record<string, number>,
        watch: (watchRes.data ?? null) as Watch | null,
      });
    })();
    return () => {
      active = false;
    };
  }, [id, kind, supabase]);

  if (!shown) return null;

  const ready = loaded && loaded.id === shown.id ? loaded : null;
  const shares = ready?.shares ?? null;
  const watch = ready?.watch ?? null;
  const loading = !ready;

  const views = num(shown.views);
  const reach = num(shown.reach);
  const rate = interactionRate(shown);
  const sharedTotal = Object.values(shares ?? {}).reduce((a, b) => a + num(b), 0);

  return (
    <BottomSheet open={!!item} onClose={onClose} title="How it did" size="tall">
      <div className="flex flex-col gap-5 pb-2">
        <Link
          href={itemHref(shown.kind as ItemKind, shown.id)}
          className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3"
        >
          <span className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-elevated">
            {shown.cover ? (
              // Not deferred: there is one image in this sheet and it is
              // on screen the moment the sheet is, so lazy would only
              // delay the thing somebody just tapped to see.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shown.cover} alt="" className="h-full w-full object-cover" />
            ) : null}
          </span>
          <span className="min-w-0 flex-1 text-sm font-semibold">
            <span className="block truncate">
              {itemTitle(shown.kind as ItemKind, shown.caption)}
            </span>
            <span className="block text-xs font-normal text-muted">
              Open {shown.kind === "shot" ? "Shot" : "post"}
            </span>
          </span>
          <ChevronRight size={17} className="shrink-0 text-faint" />
        </Link>

        <Group title="Who saw it">
          <Row label="Views" value={formatCount(views)} />
          <Row label="People" value={formatCount(reach)} />
          <Row label="Came back" value={viewsPerPerson(views, reach)} />
        </Group>

        <Group title="What they did">
          <Row label="Hype" value={formatCount(num(shown.hypes))} />
          <Row label="Comments" value={formatCount(num(shown.comments))} />
          <Row label="Saves" value={formatCount(num(shown.saves))} />
          <Row
            label="Per 100 people"
            value={rate == null ? "—" : `${rate}`}
            foot={rate == null ? "nobody has seen it yet" : undefined}
          />
        </Group>

        {shown.kind === "shot" && (
          <Group title="How much they watched">
            {loading && !watch ? (
              <Waiting />
            ) : (
              <>
                <Row
                  label="Watched on average"
                  value={
                    shown.avg_completion == null && !watch?.avg_completion
                      ? "—"
                      : `${watch?.avg_completion ?? shown.avg_completion}%`
                  }
                />
                <Row label="Watched to the end" value={formatCount(num(watch?.finished))} />
                <Row label="Replays" value={formatCount(num(watch?.replays))} />
                <Row label="Time spent" value={watchTime(num(watch?.total_watch_ms))} />
              </>
            )}
          </Group>
        )}

        <Group title="Where it went">
          {loading && !shares ? (
            <Waiting />
          ) : sharedTotal === 0 ? (
            // A div, not a p: dl takes dt/dd pairs and div groups, and a
            // bare p inside one is invalid markup.
            <div className="px-1 py-1 text-xs text-faint">Not shared anywhere yet.</div>
          ) : (
            SHARE_DESTINATIONS.filter((d) => num(shares?.[d.key]) > 0).map((d) => (
              <Row key={d.key} label={d.label} value={formatCount(num(shares?.[d.key]))} />
            ))
          )}
        </Group>
      </div>
    </BottomSheet>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="px-1 pb-1.5 text-xs font-bold uppercase tracking-widest text-faint">
        {title}
      </h3>
      {/* A definition list, so each line is read as the pair it is —
          “Views, 2,087” rather than two unrelated runs of text. */}
      <dl className="divide-y divide-border/60 rounded-2xl border border-border bg-surface px-3">
        {children}
      </dl>
    </section>
  );
}

function Row({ label, value, foot }: { label: string; value: string; foot?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5">
      <dt className="min-w-0 text-sm text-muted">
        {label}
        {foot && <span className="block text-[11px] text-faint">{foot}</span>}
      </dt>
      <dd className="m-0 shrink-0 text-sm font-bold tabular-nums">{value}</dd>
    </div>
  );
}

function Waiting() {
  return (
    <div className="flex items-center gap-2 py-3 text-xs text-faint">
      <Loader2 size={14} className="animate-spin" aria-hidden />
      Working it out…
    </div>
  );
}
