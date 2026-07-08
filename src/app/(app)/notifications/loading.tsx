import { Skeleton, SkeletonCircle, SkeletonLine } from "@/components/ui/Skeleton";

/** Mirrors the real notifications layout: filter pills + rows with a
 *  media thumb on the right (some grouped rows show stacked avatars). */
export default function NotificationsLoading() {
  return (
    <>
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border/60 bg-background/80 px-4 backdrop-blur-xl">
        <h1 className="flex-1 text-lg font-bold tracking-tight">Notifications</h1>
      </header>

      {/* Filter pills */}
      <div className="no-scrollbar flex gap-2 overflow-x-hidden px-4 py-3">
        {[48, 64, 88, 72, 80].map((w, i) => (
          <Skeleton key={i} rounded="rounded-pill" className="h-8 shrink-0" style={{ width: w }} />
        ))}
      </div>

      <div className="flex flex-col">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-2.5">
            {/* Every third row fakes a grouped avatar stack */}
            {i % 3 === 0 ? (
              <div className="relative h-11 w-11 shrink-0">
                <div className="absolute left-0 top-0"><SkeletonCircle size={34} /></div>
                <div className="absolute bottom-0 right-0"><SkeletonCircle size={34} /></div>
              </div>
            ) : (
              <SkeletonCircle size={44} />
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <SkeletonLine width={`${55 + (i % 3) * 12}%`} height={11} />
              <SkeletonLine width={48} height={9} />
            </div>
            <Skeleton rounded="rounded-lg" className="h-11 w-11 shrink-0" />
          </div>
        ))}
      </div>
    </>
  );
}
