import { ListRowSkeleton } from "@/components/skeletons/Skeletons";

export default function MessagesLoading() {
  return (
    <>
      <header className="sticky top-0 z-20 flex h-[calc(3.5rem+var(--sat))] items-center pt-[var(--sat)] border-b border-border/60 chrome-bar px-4">
        <h1 className="flex-1 text-[17px] font-extrabold tracking-tight">Messages</h1>
      </header>
      <div className="flex flex-col">
        {Array.from({ length: 7 }).map((_, i) => (
          <ListRowSkeleton key={i} avatarSize={52} />
        ))}
      </div>
    </>
  );
}
