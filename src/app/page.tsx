import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="relative flex min-h-dvh w-full flex-col items-center justify-between overflow-hidden bg-background px-6 pb-10 pt-20">
      {/* Animated glow background */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
        <div className="animate-drift absolute -left-24 -top-24 h-80 w-80 rounded-full bg-accent/25 blur-[100px]" />
        <div className="animate-drift-slow absolute -right-20 top-1/3 h-72 w-72 rounded-full bg-violet-600/30 blur-[110px]" />
        <div className="animate-drift absolute bottom-0 left-1/4 h-72 w-72 rounded-full bg-fuchsia-500/20 blur-[120px]" />
      </div>

      {/* Wordmark + tagline */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center text-center">
        <h1 className="text-6xl font-extrabold tracking-tight text-foreground sm:text-7xl">
          Hypefy<span className="text-accent">.</span>
        </h1>
        <p className="mt-4 max-w-xs text-lg font-medium text-muted">
          Where your personality lives.
        </p>
      </div>

      {/* Call to action */}
      <div className="relative z-10 flex w-full max-w-sm flex-col gap-3">
        <Link
          href="/signup"
          className="flex h-14 w-full items-center justify-center rounded-pill bg-accent text-base font-bold text-accent-ink transition-transform active:scale-[0.98]"
        >
          Get Started
        </Link>
        <Link
          href="/signin"
          className="flex h-14 w-full items-center justify-center rounded-pill text-base font-semibold text-muted transition-colors active:text-foreground"
        >
          Sign In
        </Link>
      </div>
    </main>
  );
}
