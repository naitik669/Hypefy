import { BottomNav } from "@/components/layout/BottomNav";

/**
 * Shell for the signed-in app: a mobile-first centered column with a
 * persistent bottom nav. Desktop sees the same narrow column (Twitter-style).
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-background">
      <div className="flex-1 pb-[84px]">{children}</div>
      <BottomNav />
    </div>
  );
}
