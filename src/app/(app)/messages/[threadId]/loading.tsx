import { Skeleton, SkeletonCircle, SkeletonLine } from "@/components/ui/Skeleton";

export default function ThreadLoading() {
  // Alternating inbound / outbound bubble widths
  const bubbles = [
    { mine: false, w: "60%" },
    { mine: true, w: "45%" },
    { mine: false, w: "72%" },
    { mine: true, w: "38%" },
    { mine: false, w: "50%" },
    { mine: true, w: "64%" },
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border/60 bg-background/80 px-3 backdrop-blur-xl">
        <SkeletonCircle size={24} />
        <SkeletonCircle size={36} />
        <SkeletonLine width={120} height={12} />
      </header>

      {/* Bubbles */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        {bubbles.map((b, i) => (
          <div key={i} className={`flex ${b.mine ? "justify-end" : "justify-start"}`}>
            <Skeleton
              rounded="rounded-2xl"
              className="h-10"
              style={{ width: b.w }}
            />
          </div>
        ))}
      </div>

      {/* Composer */}
      <div className="border-t border-border/60 p-3">
        <Skeleton rounded="rounded-pill" className="h-11 w-full" />
      </div>
    </div>
  );
}
