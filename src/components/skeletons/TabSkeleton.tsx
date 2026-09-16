import { Phone, Plus, Search } from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  FeedCardSkeleton,
  HomeTopBarStatic,
  ListRowSkeleton,
  PageHeaderStatic,
  ReelSkeleton,
  ShowsRowSkeleton,
} from "@/components/skeletons/Skeletons";
import { ProfileSkeleton } from "@/components/skeletons/ProfileSkeleton";

/**
 * The shape of a tab before its data lands.
 *
 * One component for two jobs that have to agree: each tab's `loading.tsx`,
 * and the page SwipeNav slides in under your finger. Drawing both from here
 * means the page you pull in IS the page that loads.
 */
export type TabPath = "/discover" | "/home" | "/messages" | "/shots" | "/profile";

export function TabSkeleton({ tab }: { tab: TabPath }) {
  switch (tab) {
    case "/home":
      return (
        <>
          <HomeTopBarStatic />
          <ShowsRowSkeleton />
          <FeedCardSkeleton />
          <FeedCardSkeleton />
        </>
      );
    case "/messages":
      return <MessagesSkeleton />;
    case "/shots":
      return <ReelSkeleton />;
    case "/profile":
      return <ProfileSkeleton />;
    case "/discover":
      return <DiscoverSkeleton />;
  }
}

/** MessagesHeader, the search box and the All / Unread / Requests pills, then rows. */
function MessagesSkeleton() {
  return (
    <>
      <header className="sticky top-0 z-20 flex h-[calc(4rem+var(--sat))] items-center justify-between bg-background px-4 pt-[var(--sat)]">
        <h1 className="text-[28px] font-extrabold leading-tight tracking-tight">Messages</h1>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="flex h-10 w-10 items-center justify-center text-foreground">
            <Phone size={21} />
          </span>
          <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-accent text-accent-ink shadow-md">
            <Plus size={22} strokeWidth={2.75} />
          </span>
        </div>
      </header>
      <div className="px-4 pt-3">
        <div className="flex h-11 items-center gap-2 rounded-2xl border border-border bg-surface px-3.5 text-sm text-faint">
          <Search size={17} className="shrink-0" />
          Search messages
        </div>
      </div>
      <div className="flex gap-2 px-4 pb-1 pt-3">
        {["All", "Unread", "Requests"].map((label, i) => (
          <span
            key={label}
            className={`rounded-pill px-4 py-1.5 text-sm font-semibold ${
              i === 0 ? "bg-accent text-accent-ink" : "bg-surface text-muted"
            }`}
          >
            {label}
          </span>
        ))}
      </div>
      <div className="flex flex-col pt-1">
        {Array.from({ length: 7 }).map((_, i) => (
          <ListRowSkeleton key={i} avatarSize={52} />
        ))}
      </div>
    </>
  );
}

/**
 * The filter button's sliders, drawn inline. The real button uses Phosphor;
 * importing that library here pulled its whole icon set into every screen
 * that can show a tab's loading shape, SwipeNav included.
 */
function FilterGlyph() {
  return (
    <svg width="19" height="19" viewBox="0 0 256 256" fill="none" stroke="currentColor" strokeWidth="16" strokeLinecap="round" aria-hidden="true">
      <line x1="136" y1="172" x2="216" y2="172" />
      <line x1="40" y1="172" x2="104" y2="172" />
      <circle cx="120" cy="172" r="16" />
      <line x1="184" y1="84" x2="216" y2="84" />
      <line x1="40" y1="84" x2="152" y2="84" />
      <circle cx="168" cy="84" r="16" />
    </svg>
  );
}

/**
 * Discover: its header, the search box beside the filter, then the grid.
 * The grid is PinFeed's: three columns, gap-1, px-1, rounded-[10px] tiles of
 * mixed heights (photos and 9:16 Shots).
 */
function DiscoverSkeleton() {
  const columns = [
    ["aspect-[4/5]", "aspect-[9/16]", "aspect-square"],
    ["aspect-[9/16]", "aspect-square", "aspect-[4/5]"],
    ["aspect-square", "aspect-[4/5]", "aspect-[9/16]"],
  ];
  return (
    <>
      <PageHeaderStatic title="Discover" />
      <div className="flex items-center gap-2 px-4 py-2.5">
        <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-2xl border border-border bg-surface px-4 text-sm text-faint">
          <Search size={18} className="shrink-0 text-muted" />
          <span className="truncate">Search people, posts, #tags</span>
        </div>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface text-muted">
          <FilterGlyph />
        </span>
      </div>
      <div className="flex items-start gap-1 px-1 pt-2">
        {columns.map((col, c) => (
          <div key={c} className="flex min-w-0 flex-1 flex-col gap-1">
            {col.map((shape, i) => (
              <Skeleton key={i} rounded="rounded-[10px]" className={`w-full ${shape}`} />
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
