"use client";

import { RotateCcw } from "lucide-react";
import { HypefyMark } from "@/components/HypefyMark";

/** Route-level error boundary for the signed-in app — retry in place. */
export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-4 px-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface">
        <HypefyMark className="h-8 w-8 text-accent" />
      </div>
      <div>
        <h1 className="text-[17px] font-extrabold tracking-tight">
          That didn&apos;t load<span className="text-accent">.</span>
        </h1>
        <p className="mx-auto mt-1.5 max-w-[260px] text-sm leading-snug text-muted">
          Something broke on our side. Try again — it usually clears right up.
        </p>
      </div>
      <button
        type="button"
        onClick={reset}
        className="flex items-center gap-2 rounded-pill bg-accent px-5 py-2.5 text-sm font-bold text-accent-ink transition-transform active:scale-95"
      >
        <RotateCcw size={15} /> Try again
      </button>
    </div>
  );
}
