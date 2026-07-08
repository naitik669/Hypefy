import { Skeleton, SkeletonLine } from "@/components/ui/Skeleton";
import { FeedCardSkeleton, ListRowSkeleton } from "@/components/skeletons/Skeletons";

/** Mirrors the real Discover structure: header, search, category chips,
 *  tag rail, shots carousel, trending post, people rows. */
export default function DiscoverLoading() {
  return (
    <>
      <header className="sticky top-0 z-20 flex h-14 items-center border-b border-border/60 bg-background/80 px-4 backdrop-blur-xl">
        <h1 className="flex-1 text-[17px] font-extrabold tracking-tight">Discover</h1>
      </header>

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
