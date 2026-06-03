import { ListRowSkeleton } from "@/components/skeletons/Skeletons";

export default function NotificationsLoading() {
  return (
    <>
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border/60 bg-background/80 px-4 backdrop-blur-xl">
        <h1 className="flex-1 text-lg font-bold tracking-tight">Notifications</h1>
      </header>
      <div className="flex flex-col">
        {Array.from({ length: 8 }).map((_, i) => (
          <ListRowSkeleton key={i} avatarSize={44} />
        ))}
      </div>
    </>
  );
}
