import { Skeleton, SkeletonCircle, SkeletonLine } from "@/components/ui/Skeleton";

/** Shared skeleton for the settings hub and its sub-pages. */
export default function SettingsLoading() {
  return (
    <>
      <header className="sticky top-0 z-20 flex h-[calc(3.5rem+var(--sat))] items-center pt-[var(--sat)] gap-2 border-b border-border/60 chrome-bar px-4">
        <SkeletonCircle size={32} />
        <SkeletonLine width={96} height={14} />
      </header>
      <div className="flex flex-col gap-6 px-4 pt-4">
        <SkeletonLine width={72} height={10} />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <SkeletonCircle size={40} />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <SkeletonLine width="35%" height={11} />
              <SkeletonLine width="55%" height={9} />
            </div>
            <Skeleton rounded="rounded-full" className="h-4 w-4" />
          </div>
        ))}
      </div>
    </>
  );
}
