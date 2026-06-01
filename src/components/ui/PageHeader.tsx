"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

/** Sticky page header: optional back button, title, optional right slot. */
export function PageHeader({
  title,
  showBack = false,
  right,
}: {
  title: string;
  showBack?: boolean;
  right?: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-1 border-b border-border/60 bg-background/80 px-2 backdrop-blur-xl">
      {showBack ? (
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Back"
          className="flex h-10 w-10 items-center justify-center rounded-full text-foreground transition-colors hover:bg-white/5"
        >
          <ChevronLeft size={24} />
        </button>
      ) : (
        <span className="w-2" />
      )}
      <h1 className="flex-1 truncate px-1 text-lg font-bold tracking-tight">{title}</h1>
      {right && <div className="flex items-center gap-1">{right}</div>}
    </header>
  );
}
