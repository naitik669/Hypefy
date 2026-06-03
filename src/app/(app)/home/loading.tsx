import {
  HeaderSkeleton,
  ShowsRowSkeleton,
  FeedCardSkeleton,
} from "@/components/skeletons/Skeletons";

export default function HomeLoading() {
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
