"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

/** Sticky page header: optional back button, title, optional right slot. */
export function PageHeader({
  title,
  showBack = false,
  onBack,
  right,
}: {
  title: string;
  showBack?: boolean;
  /** Override what the arrow does. For screens with internal steps, so the
   *  single back arrow retreats a step before it leaves the screen, instead
   *  of the screen needing a second back control of its own. */
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <header className="sticky top-0 z-20 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center gap-1 border-b border-border/60 bg-background/80 px-2 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      {showBack ? (
        <button
          type="button"
          onClick={() => (onBack ? onBack() : router.back())}
          aria-label="Back"
          className="flex h-10 w-10 items-center justify-center rounded-full text-foreground transition-colors hover:bg-white/5"
        >
          <ChevronLeft size={24} />
        </button>
      ) : (
        <span className="w-2" />
      )}
      <h1 className="flex-1 truncate px-1 text-[17px] font-extrabold tracking-tight">{title}</h1>
      {right && <div className="flex items-center gap-1">{right}</div>}
    </header>
  );
}
