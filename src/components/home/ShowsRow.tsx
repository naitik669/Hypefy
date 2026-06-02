import Link from "next/link"
import { Plus } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import type { Show } from "@/lib/mock";

/** Horizontal row of Shows (24h content). Tapping navigates to /shows/[id]. */
export function ShowsRow({ shows }: { shows: Show[] }) {
  return (
    <div className="no-scrollbar flex gap-4 overflow-x-auto px-4 py-4">
      {/* Your Show — navigates to the Add Show page */}
      <Link href="/shows/add" className="flex w-16 shrink-0 flex-col items-center gap-1.5">
        <div className="relative flex h-16 w-16 items-center justify-center rounded-[20px] border-2 border-dashed border-border bg-surface transition-opacity active:opacity-70">
          <Plus size={22} className="text-muted" strokeWidth={2.4} />
          <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-accent-ink ring-4 ring-background">
            <Plus size={14} strokeWidth={3} />
          </span>
        </div>
        <span className="max-w-full truncate text-xs text-muted">Your Show</span>
      </Link>

      {/* Friends' shows — link to /shows/[id] */}
      {shows.map((s) => (
        <Link
          key={s.id}
          href={`/shows/${s.id}`}
          className="flex w-16 shrink-0 flex-col items-center gap-1.5"
        >
          <div
            className={`rounded-[22px] p-[2.5px] ${
              s.seen ? "bg-border" : "bg-accent"
            }`}
          >
            <div className="rounded-[20px] bg-background p-[2px]">
              <Avatar name={s.name} hue={s.hue} size={56} className="rounded-[18px]" />
            </div>
          </div>
          <span className="max-w-full truncate text-xs text-muted">{s.name}</span>
        </Link>
      ))}
    </div>
  );
}
