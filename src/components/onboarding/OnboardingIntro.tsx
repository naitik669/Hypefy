import { HypeMascot } from "@/components/mascot/HypeMascot";

export function OnboardingIntro() {
  return (
    <div className="relative flex flex-col items-center px-6 pt-16 text-center">
      {/* Sparkles */}
      <span className="animate-twinkle absolute left-10 top-14 text-accent [animation-delay:0.3s]">
        ✦
      </span>
      <span className="animate-twinkle absolute right-12 top-24 text-hype [animation-delay:1s]">
        ✦
      </span>

      <div className="animate-rise">
        <HypeMascot mood="friendly" size="lg" animated />
      </div>

      <h1 className="animate-rise mt-5 text-5xl font-extrabold tracking-tight [animation-delay:0.05s]">
        Hypefy<span className="text-accent">.</span>
      </h1>
      <p className="animate-rise mt-3 text-lg font-semibold text-foreground [animation-delay:0.1s]">
        Where your personality lives.
      </p>
      <p className="animate-rise mt-2 max-w-xs text-sm text-muted [animation-delay:0.15s]">
        Rooms, posts, shots, and hypes — built around your social energy.
      </p>
    </div>
  );
}
