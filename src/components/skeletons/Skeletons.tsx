import { Skeleton, SkeletonCircle, SkeletonLine } from "@/components/ui/Skeleton";

/** Full-screen Shots (reels) skeleton — matches the ReelsFeed layout. */
export function ReelSkeleton() {
  return (
    <div className="fixed inset-x-0 top-0 bottom-[72px] z-10 mx-auto max-w-[480px] overflow-hidden bg-black">
      <Skeleton rounded="rounded-none" className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent" />

      {/* Right action rail */}
      <div className="absolute bottom-24 right-3 flex flex-col items-center gap-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCircle key={i} size={32} />
        ))}
      </div>

      {/* Author + caption */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-4 pr-16">
        <div className="flex items-center gap-2.5">
          <SkeletonCircle size={38} />
          <SkeletonLine width={110} height={12} />
        </div>
        <SkeletonLine width="60%" height={10} />
      </div>
    </div>
  );
}

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

/** Full-screen Show (story) skeleton — matches the ShowViewer layout. */
export function ShowSkeleton() {
  return (
    <div className="fixed inset-0 z-30 mx-auto max-w-[480px] bg-black">
      <Skeleton rounded="rounded-none" className="absolute inset-0" />
      {/* Progress bars */}
      <div className="absolute inset-x-0 top-0 flex gap-1 p-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonLine key={i} width="100%" height={3} />
        ))}
      </div>
      {/* Author */}
      <div className="absolute inset-x-0 top-7 flex items-center gap-2.5 p-4">
        <SkeletonCircle size={36} />
        <SkeletonLine width={110} height={11} />
      </div>
    </div>
  );
}

/** Generic app-shell skeleton (header + feed) — neutral route fallback. */
export function AppShellSkeleton() {
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
}

/** Centered single-post (permalink) skeleton. */
export function PostDetailSkeleton() {
  return (
    <>
      <HeaderSkeleton />
      <FeedCardSkeleton />
    </>
  );
}

/** Search page skeleton — search bar + result rows. */
export function SearchSkeleton() {
  return (
    <>
      <div className="sticky top-0 z-20 border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur-xl">
        <Skeleton className="h-11 w-full" rounded="rounded-pill" />
      </div>
      <div className="flex flex-col pt-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <ListRowSkeleton key={i} avatarSize={46} />
        ))}
      </div>
    </>
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
