import Link from "next/link";

/**
 * Slim conversion bar pinned to the bottom of PUBLIC pages (post / profile /
 * shot) for logged-out visitors who arrive from a shared link — the one
 * growth surface a signed-in user never sees.
 */
export function JoinBanner() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 px-4 py-3 backdrop-blur-md pb-[calc(0.75rem+var(--sab))]">
      <div className="mx-auto flex w-full max-w-md items-center gap-3">
        <p className="min-w-0 flex-1 text-sm">
          <span className="font-extrabold tracking-tight">Hypefy<span className="text-accent">.</span></span>{" "}
          <span className="text-muted">Where your personality lives.</span>
        </p>
        <Link
          href="/signup"
          className="shrink-0 rounded-pill bg-accent px-4 py-2 text-sm font-bold text-accent-ink transition-transform active:scale-95"
        >
          Join
        </Link>
      </div>
    </div>
  );
}
