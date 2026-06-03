import { Skeleton, SkeletonCircle, SkeletonLine } from "@/components/ui/Skeleton";

/** Static header bar skeleton (matches TopBar height/layout). */
export function HeaderSkeleton({ centerWordmark = false }: { centerWordmark?: boolean }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border/60 bg-background/80 px-4 backdrop-blur-xl">
      <SkeletonCircle size={32} />
      {centerWordmark ? (
        <span className="text-xl font-extrabold tracking-tight text-foreground/90">
          Hypefy<span className="text-accent">.</span>
        </span>
      ) : (
        <SkeletonLine width={96} height={16} />
      )}
      <SkeletonCircle size={32} />
    </header>
  );
}

/** Horizontal Shows row skeleton. */
export function ShowsRowSkeleton() {
  return (
    <div className="no-scrollbar flex gap-4 overflow-x-auto px-4 py-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex shrink-0 flex-col items-center gap-1.5">
          <SkeletonCircle size={62} />
          <SkeletonLine width={42} height={9} />
        </div>
      ))}
    </div>
  );
}

/** A single feed post card skeleton. */
export function FeedCardSkeleton() {
  return (
    <div className="border-b border-border/60 pb-3">
      {/* Author row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <SkeletonCircle size={40} />
        <div className="flex flex-1 flex-col gap-1.5">
          <SkeletonLine width={120} height={11} />
          <SkeletonLine width={72} height={9} />
        </div>
        <SkeletonCircle size={24} />
      </div>
      {/* Media */}
      <Skeleton rounded="rounded-none" className="aspect-square w-full" />
      {/* Actions */}
      <div className="flex items-center gap-4 px-4 pt-3">
        <SkeletonCircle size={24} />
        <SkeletonCircle size={24} />
        <SkeletonCircle size={24} />
        <div className="flex-1" />
        <SkeletonCircle size={24} />
      </div>
      {/* Caption */}
      <div className="flex flex-col gap-1.5 px-4 pt-3">
        <SkeletonLine width="80%" height={10} />
        <SkeletonLine width="55%" height={10} />
      </div>
    </div>
  );
}

/** A conversation / list row skeleton (avatar + two lines). */
export function ListRowSkeleton({ avatarSize = 52 }: { avatarSize?: number }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <SkeletonCircle size={avatarSize} />
      <div className="flex flex-1 flex-col gap-2">
        <SkeletonLine width="40%" height={11} />
        <SkeletonLine width="70%" height={10} />
      </div>
      <SkeletonLine width={28} height={9} />
    </div>
  );
}
