import { HypeMascot } from "@/components/mascot/HypeMascot";

/**
 * BrandLoader — full-screen branded splash shown while the app boots
 * or a heavy route resolves. Mascot in a glowing disc, wordmark, and
 * three bouncing lime dots.
 */
export function BrandLoader({ label = "Loading" }: { label?: string }) {
  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-[480px] flex-col items-center justify-center overflow-hidden bg-background px-6">
      {/* Ambient glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
        <div className="animate-drift absolute left-1/2 top-1/3 h-[360px] w-[360px] -translate-x-1/2 rounded-full bg-accent/12 blur-[120px]" />
      </div>

      <div className="relative z-10 flex flex-col items-center">
        {/* Mascot in a glowing disc */}
        <div className="relative animate-disc-in">
          <div
            aria-hidden
            className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/15 blur-2xl"
          />
          <div className="relative flex h-28 w-28 items-center justify-center rounded-full border border-white/5 bg-white/[0.03]">
            <HypeMascot mood="welcome" size="md" animated />
          </div>
        </div>

        {/* Wordmark */}
        <h1 className="mt-7 text-3xl font-extrabold tracking-tight text-foreground">
          Hypefy<span className="text-accent">.</span>
        </h1>

        {/* Bouncing dots */}
        <div className="mt-5 flex items-center gap-1.5" role="status" aria-label={label}>
          <span className="animate-dot-bounce h-2 w-2 rounded-full bg-accent" style={{ animationDelay: "0ms" }} />
          <span className="animate-dot-bounce h-2 w-2 rounded-full bg-accent" style={{ animationDelay: "160ms" }} />
          <span className="animate-dot-bounce h-2 w-2 rounded-full bg-accent" style={{ animationDelay: "320ms" }} />
        </div>
      </div>
    </main>
  );
}
