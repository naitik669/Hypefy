import { Skeleton, SkeletonLine } from "@/components/ui/Skeleton";
import { FeedCardSkeleton, ListRowSkeleton } from "@/components/skeletons/Skeletons";

export default function DiscoverLoading() {
  return (
    <>
      <header className="sticky top-0 z-20 flex h-14 items-center border-b border-border/60 bg-background/80 px-4 backdrop-blur-xl">
        <h1 className="flex-1 text-lg font-bold tracking-tight">Discover</h1>
      </header>

      {/* Search bar placeholder */}
      <div className="px-4 py-3">
        <Skeleton rounded="rounded-pill" className="h-11 w-full" />
      </div>

      {/* Trending */}
      <SkeletonLine width={120} height={14} className="mx-4 my-4" />
      <FeedCardSkeleton />

      {/* People */}
      <SkeletonLine width={140} height={14} className="mx-4 my-4" />
      {Array.from({ length: 4 }).map((_, i) => (
        <ListRowSkeleton key={i} avatarSize={48} />
      ))}
    </>
  );
}
