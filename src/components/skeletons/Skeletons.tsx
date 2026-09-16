import { ChevronLeft, Compass, Star } from "lucide-react";
import { Skeleton, SkeletonLine } from "@/components/ui/Skeleton";

/*
 * Loading shapes.
 *
 * Two rules, because a skeleton that is wrong is worse than none:
 *
 *  1. Everything that never changes is drawn for real: titles, icons, the
 *     search box, tab labels. Only what the server is fetching shimmers. A
 *     screen of grey bars where the header should be reads as the app being
 *     slow; the real header reads as the app being there already.
 *  2. Every size is copied from the component it stands in for, and says
 *     where from, so the page lands without anything moving. When that
 *     component changes, this has to change with it.
 *
 * Only pages that fetch on the server have one. Pages that draw their own
 * loading rows (Activity, Search) don't, or you get two placeholders in a row.
 */

/** A face: Avatar is a squircle, rounded-[30%]. */
export function AvatarSkeleton({ size }: { size: number }) {
  return <Skeleton rounded="rounded-[30%]" className="shrink-0" style={{ width: size, height: size }} />;
}

/** PageHeader: back button, title. */
export function PageHeaderStatic({ title, back = true }: { title: string; back?: boolean }) {
  return (
    <header className="sticky top-0 z-20 flex h-[calc(3.5rem+var(--sat))] items-center gap-1 border-b border-border/60 chrome-bar px-2 pt-[var(--sat)]">
      {back ? (
        <span className="flex h-10 w-10 items-center justify-center text-foreground">
          <ChevronLeft size={24} />
        </span>
      ) : (
        <span className="w-2" />
      )}
      <h1 className="flex-1 truncate px-1 text-[17px] font-extrabold tracking-tight">{title}</h1>
    </header>
  );
}

/** Home's TopBar: compass, the wordmark, the activity star. */
export function HomeTopBarStatic() {
  return (
    <header className="sticky top-0 z-20 flex h-[calc(3.5rem+var(--sat))] items-center justify-between border-b border-border/60 chrome-bar px-4 pt-[var(--sat)]">
      <div className="flex w-20 items-center">
        <span className="flex h-10 w-10 items-center justify-center text-foreground">
          <Compass size={22} strokeWidth={2.2} />
        </span>
      </div>
      <span className="px-1.5 py-1">
        <span className="relative text-xl font-extrabold tracking-tight">
          Hypefy
          <span className="absolute left-full top-0 text-accent">.</span>
        </span>
      </span>
      <div className="flex w-20 justify-end">
        <span className="flex h-9 w-9 items-center justify-center text-foreground">
          <Star size={22} strokeWidth={2.2} />
        </span>
      </div>
    </header>
  );
}

/** ShowsRow: 65px squircle rings (56 avatar + 2 + 2.5 each side), label under. */
export function ShowsRowSkeleton() {
  return (
    <div className="no-scrollbar flex gap-4 overflow-hidden px-4 py-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex w-16 shrink-0 flex-col items-center gap-1.5">
          <Skeleton rounded="rounded-[22px]" className="h-[65px] w-[65px]" />
          <SkeletonLine width={40} height={9} className="mt-0.5" />
        </div>
      ))}
    </div>
  );
}

/** FeedCard: author row px-4 py-3, 40px face, media mx-4 rounded-2xl, actions gap-5. */
export function FeedCardSkeleton() {
  return (
    <div className="border-b border-border/50 pb-3">
      <div className="flex items-center gap-3 px-4 py-3">
        <AvatarSkeleton size={40} />
        <div className="flex flex-1 flex-col gap-1.5">
          <SkeletonLine width={120} height={11} />
          <SkeletonLine width={64} height={9} />
        </div>
      </div>
      <Skeleton rounded="rounded-2xl" className="mx-4 aspect-[4/5]" />
      <div className="flex items-center gap-5 px-4 pt-3">
        <SkeletonLine width={24} height={24} />
        <SkeletonLine width={24} height={24} />
        <SkeletonLine width={24} height={24} />
      </div>
      <div className="px-4 pt-2.5">
        <SkeletonLine width="70%" height={10} />
      </div>
    </div>
  );
}

/** A list row: face, name, preview line (Messages, Search). */
export function ListRowSkeleton({ avatarSize = 52 }: { avatarSize?: number }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <AvatarSkeleton size={avatarSize} />
      <div className="flex flex-1 flex-col gap-2">
        <SkeletonLine width="38%" height={11} />
        <SkeletonLine width="62%" height={10} />
      </div>
    </div>
  );
}

/** ReelsFeed: black stage above the nav (bottom-[72px]), author and caption low. */
export function ReelSkeleton() {
  return (
    <div className="fixed inset-x-0 top-0 bottom-[72px] z-10 mx-auto max-w-[480px] overflow-hidden bg-black">
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-4 pr-16">
        <div className="flex items-center gap-2.5">
          <AvatarSkeleton size={36} />
          <SkeletonLine width={110} height={12} />
        </div>
        <SkeletonLine width="55%" height={10} />
      </div>
    </div>
  );
}

/** ShowViewer: black, progress segments along the top. */
export function ShowSkeleton() {
  return (
    <div className="fixed inset-0 z-30 mx-auto max-w-[480px] bg-black">
      <div className="absolute inset-x-0 top-0 flex gap-1 p-3 pt-[calc(var(--sat)+12px)]">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-[3px] flex-1 rounded-full bg-white/20" />
        ))}
      </div>
    </div>
  );
}

/** A post on its own page: PageHeader "Post", then the card. */
export function PostDetailSkeleton() {
  return (
    <>
      <PageHeaderStatic title="Post" />
      <FeedCardSkeleton />
    </>
  );
}
