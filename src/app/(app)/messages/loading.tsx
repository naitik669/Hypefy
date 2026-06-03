import { ListRowSkeleton } from "@/components/skeletons/Skeletons";

export default function MessagesLoading() {
  return (
    <>
      <header className="sticky top-0 z-20 flex h-14 items-center border-b border-border/60 bg-background/80 px-4 backdrop-blur-xl">
        <h1 className="flex-1 text-lg font-bold tracking-tight">Messages</h1>
      </header>
      <div className="flex flex-col">
        {Array.from({ length: 7 }).map((_, i) => (
          <ListRowSkeleton key={i} avatarSize={52} />
        ))}
      </div>
    </>
  );
}
