"use client";

import { useMemo, useState } from "react";
import { Film, LayoutGrid } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatCount } from "@/lib/format";
import { itemTitle, type ItemKind } from "@/lib/creator-insights";
import { haptics } from "@/lib/haptics";
import {
  CONTENT_SORTS,
  num,
  readSort,
  sortItems,
  type ItemRow,
  type SortKey,
} from "@/lib/creator-content";
import { ItemDetailSheet } from "@/components/creator/ItemDetailSheet";

/**
 * Everything you have posted, in whatever order answers the question.
 *
 * Sorted here rather than in the address. Fifty rows reorder instantly in
 * the browser, and a round trip to the server to put the same fifty rows
 * in a different order is a round trip to re-render a list the reader is
 * already looking at.
 *
 * A row opens the sheet rather than the post. Tapping a row in a list of
 * numbers to be shown the numbers is what the list is for; the post itself
 * is one tap further in, from the sheet.
 */
export function ContentList({ items, sort }: { items: ItemRow[]; sort?: string }) {
  const [by, setBy] = useState<SortKey>(readSort(sort));
  const [open, setOpen] = useState<ItemRow | null>(null);

  const rows = useMemo(() => sortItems(items, by), [items, by]);

  if (items.length === 0) {
    return (
      <div className="px-4 pt-8">
        <EmptyState
          icon={LayoutGrid}
          title="Nothing posted yet"
          text="Once you share a post or a Shot, how it did shows up here."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-4 pb-10 pt-3">
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {CONTENT_SORTS.map((s) => {
          const on = s.key === by;
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={on}
              data-content-sort={s.key}
              onClick={() => {
                haptics.select();
                setBy(s.key);
              }}
              className={`shrink-0 rounded-pill border px-3 py-1.5 text-xs font-bold transition-colors ${
                on
                  ? "border-accent bg-accent text-accent-ink"
                  : "border-border bg-surface text-muted hover:text-foreground"
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={`${row.kind}-${row.id}`}>
            <button
              type="button"
              onClick={() => {
                haptics.select();
                setOpen(row);
              }}
              className="flex w-full items-center gap-3 rounded-2xl border border-border bg-surface p-2.5 text-left transition-colors hover:bg-elevated"
            >
              <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-elevated">
                {row.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    loading="lazy"
                    decoding="async"
                    src={row.cover}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : null}
                {row.kind === "shot" && (
                  <span className="absolute bottom-0.5 right-0.5 rounded bg-black/60 p-0.5 text-white">
                    <Film size={9} aria-hidden />
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {itemTitle(row.kind as ItemKind, row.caption)}
                </span>
                <span className="block text-xs text-muted tabular-nums">
                  {formatCount(num(row.views))} views · {formatCount(num(row.reach))} people
                  {row.avg_completion != null ? ` · ${row.avg_completion}% watched` : ""}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <ItemDetailSheet item={open} onClose={() => setOpen(null)} />
    </div>
  );
}
