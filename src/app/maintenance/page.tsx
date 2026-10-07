import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Back soon",
  robots: { index: false, follow: false },
};

/**
 * What everyone sees while Hypefy is down on purpose.
 *
 * Static and self-contained: no session, no database, no layout that needs
 * either. See src/lib/maintenance.ts for how it is switched on.
 */
export default function MaintenancePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-8 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface text-3xl font-black">
        H<span className="text-accent">.</span>
      </span>
      <h1 className="mt-6 text-xl font-extrabold tracking-tight">Back soon</h1>
      <p className="mt-2 max-w-[30ch] text-sm leading-relaxed text-muted">
        Hypefy is down for a short while. Your account, posts and messages are safe. Try again in a
        few minutes.
      </p>
      {/* A plain link, not a router call: the point is to ask the server again. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a
        href="/"
        className="mt-6 flex h-12 w-full max-w-[280px] items-center justify-center rounded-2xl bg-accent text-sm font-extrabold text-accent-ink"
      >
        Try again
      </a>
    </main>
  );
}
