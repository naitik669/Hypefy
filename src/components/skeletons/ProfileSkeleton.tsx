import { Bookmark, Grid3x3, Zap } from "lucide-react";
import { Skeleton, SkeletonLine } from "@/components/ui/Skeleton";
import { GRID, GRID_WRAP } from "@/components/profile/postGrid";

/**
 * A profile before it loads: your own and anyone's (/u/[username]).
 *
 * Sizes from ProfileHeader and ProfileTabs: the banner is mx-2 mt-2, 3:1 with
 * the card radius; the face is 84px, rounded-[26px], lifted -mt-11 over it;
 * stats are three columns beside it; the tab bar's labels are drawn for real,
 * and the grid uses the grid's own classes so tiles land where posts will.
 */
export function ProfileSkeleton() {
  return (
    <>
      <div className="mx-2 mt-2">
        <Skeleton rounded="rounded-card" className="aspect-[3/1] w-full" />
      </div>

      <div className="px-4">
        <div className="flex items-end gap-4">
          {/* relative: the banner shimmer is positioned, and would paint over a
              static wrapper, ring and all. */}
          <div className="relative -mt-11 rounded-[26px] ring-4 ring-background">
            <Skeleton rounded="rounded-[26px]" className="h-[84px] w-[84px]" />
          </div>
          <div className="flex flex-1 justify-around pb-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <SkeletonLine width={26} height={18} />
                <SkeletonLine width={44} height={9} />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-2">
          <SkeletonLine width={140} height={15} />
          <SkeletonLine width={90} height={11} />
        </div>

        <div className="mt-3 flex gap-2">
          <Skeleton rounded="rounded-xl" className="h-10 flex-1" />
          <Skeleton rounded="rounded-xl" className="h-10 flex-1" />
        </div>
      </div>

      <div className="mt-2">
        <div className="flex border-y border-border">
          {[
            { key: "Posts", Icon: Grid3x3 },
            { key: "Shots", Icon: Zap },
            { key: "Saved", Icon: Bookmark },
          ].map(({ key, Icon }, i) => (
            <span
              key={key}
              className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 py-3 text-sm font-semibold ${
                i === 0 ? "border-accent text-foreground" : "border-transparent text-muted"
              }`}
            >
              <Icon size={16} />
              {key}
            </span>
          ))}
        </div>
        <div className={`mt-3 ${GRID_WRAP}`}>
          <div className={GRID}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} rounded="rounded-xl" className="h-full w-full" />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
