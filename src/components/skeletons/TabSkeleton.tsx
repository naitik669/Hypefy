import { Skeleton, SkeletonLine } from "@/components/ui/Skeleton";
import {
  FeedCardSkeleton,
  HeaderSkeleton,
  ListRowSkeleton,
  ReelSkeleton,
  ShowsRowSkeleton,
} from "@/components/skeletons/Skeletons";
import { ProfileSkeleton } from "@/components/skeletons/ProfileSkeleton";

/**
 * The shape of a tab before its data lands.
 *
 * One component for two jobs that have to agree: each tab's `loading.tsx`,
 * and the page SwipeNav slides in under your finger. They were separate, so
 * a swipe opened a black gap with the destination's name in it and the real
 * skeleton only appeared after the route committed — two different screens
 * for one movement. Drawing both from here means the page you pull in IS the
 * page that loads.
 */
export type TabPath = "/discover" | "/home" | "/messages" | "/shots" | "/profile";

export function TabSkeleton({ tab }: { tab: TabPath }) {
  switch (tab) {
    case "/home":
      return (
        <>
          <HeaderSkeleton centerWordmark />
          <ShowsRowSkeleton />
          <div className="flex flex-col">
            {Array.from({ length: 3 }).map((_, i) => (
              <FeedCardSkeleton key={i} />
            ))}
          </div>
        </>
      );
    case "/messages":
      return (
        <>
          <TitleBar title="Messages" />
          <div className="flex flex-col">
            {Array.from({ length: 7 }).map((_, i) => (
              <ListRowSkeleton key={i} avatarSize={52} />
            ))}
          </div>
        </>
      );
    case "/shots":
      return <ReelSkeleton />;
    case "/profile":
      return <ProfileSkeleton />;
    case "/discover":
      return <DiscoverSkeleton />;
  }
}

/** A page header with its title already in place, as the real one has it. */
function TitleBar({ title }: { title: string }) {
  return (
    <header className="sticky top-0 z-20 flex h-[calc(3.5rem+var(--sat))] items-center border-b border-border/60 chrome-bar px-4 pt-[var(--sat)]">
      <h1 className="flex-1 text-[17px] font-extrabold tracking-tight">{title}</h1>
    </header>
  );
}

/** Mirrors the real Discover structure: header, search, category chips,
 *  tag rail, shots carousel, trending post, people rows. */
function DiscoverSkeleton() {
  return (
    <>
      <TitleBar title="Discover" />

      {/* Search bar placeholder */}
      <div className="px-4 py-3">
        <Skeleton rounded="rounded-pill" className="h-11 w-full" />
      </div>

      {/* Category chips */}
      <div className="no-scrollbar flex gap-2 overflow-x-hidden px-4 pb-3">
        {[64, 88, 56, 64, 72].map((w, i) => (
          <Skeleton key={i} rounded="rounded-pill" className="h-8 shrink-0" style={{ width: w }} />
        ))}
      </div>

      {/* Tag rail */}
      <div className="no-scrollbar flex gap-2 overflow-x-hidden px-4 pb-2">
        {[72, 96, 64, 84].map((w, i) => (
          <Skeleton key={i} rounded="rounded-pill" className="h-9 shrink-0" style={{ width: w }} />
        ))}
      </div>

      {/* Shots carousel */}
      <SkeletonLine width={110} height={12} className="mx-4 my-3" />
      <div className="no-scrollbar flex gap-2 overflow-x-hidden px-4 pb-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} rounded="rounded-2xl" className="h-56 w-36 shrink-0" />
        ))}
      </div>

      {/* Trending post */}
      <SkeletonLine width={90} height={12} className="mx-4 my-3" />
      <FeedCardSkeleton />

      {/* People */}
      <SkeletonLine width={120} height={12} className="mx-4 my-3" />
      {Array.from({ length: 3 }).map((_, i) => (
        <ListRowSkeleton key={i} avatarSize={48} />
      ))}
    </>
  );
}
