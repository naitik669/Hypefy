import Link from "next/link";
import { HypefyMark } from "@/components/HypefyMark";

/** Brand 404 — same voice as the offline page, with a way back home. */
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col items-center justify-center gap-4 bg-background px-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface">
        <HypefyMark className="h-8 w-8 text-accent" />
      </div>
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-faint">404</p>
        <h1 className="mt-1 text-[17px] font-extrabold tracking-tight">
          This page ghosted you<span className="text-accent">.</span>
        </h1>
        <p className="mx-auto mt-1.5 max-w-[260px] text-sm leading-snug text-muted">
          It moved, expired, or never existed. The hype is back on the feed.
        </p>
      </div>
      <Link
        href="/home"
        className="rounded-pill bg-accent px-5 py-2.5 text-sm font-bold text-accent-ink transition-transform active:scale-95"
      >
        Back to home
      </Link>
    </div>
  );
}
