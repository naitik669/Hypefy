import { Skeleton, SkeletonLine } from "@/components/ui/Skeleton";

/** Shared profile-page skeleton (own profile + public /u/[username]). */
export function ProfileSkeleton() {
  return (
    <>
      {/* Banner */}
      <Skeleton rounded="rounded-none" className="h-32 w-full" />

      <div className="px-4">
        {/* Avatar + stats */}
        <div className="flex items-end gap-4">
          <div className="-mt-11">
            <Skeleton rounded="rounded-[26px]" className="h-[84px] w-[84px] ring-4 ring-background" />
          </div>
          <div className="flex flex-1 justify-around pb-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <SkeletonLine width={28} height={14} />
                <SkeletonLine width={44} height={9} />
              </div>
            ))}
          </div>
        </div>

        {/* Identity */}
        <div className="mt-3 flex flex-col gap-2">
          <SkeletonLine width={140} height={14} />
          <SkeletonLine width={90} height={10} />
          <SkeletonLine width="75%" height={10} />
        </div>

        {/* Tags */}
        <div className="mt-3 flex gap-1.5">
          <Skeleton rounded="rounded-lg" className="h-7 w-20" />
          <Skeleton rounded="rounded-lg" className="h-7 w-16" />
          <Skeleton rounded="rounded-lg" className="h-7 w-24" />
        </div>

        {/* Action buttons */}
        <div className="mt-4 flex gap-2">
          <Skeleton rounded="rounded-xl" className="h-10 flex-1" />
          <Skeleton rounded="rounded-xl" className="h-10 w-24" />
        </div>
      </div>

      {/* Tab bar */}
      <div className="mt-5 flex border-b border-border/60">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex flex-1 justify-center py-3">
            <SkeletonLine width={48} height={12} />
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-3 gap-1 p-1">
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} rounded="rounded-md" className="aspect-square w-full" />
        ))}
      </div>
    </>
  );
}
