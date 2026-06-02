import { OnboardingIntro } from "@/components/onboarding/OnboardingIntro";
import { FeatureCarousel } from "@/components/onboarding/FeatureCarousel";
import { OnboardingCTA } from "@/components/onboarding/OnboardingCTA";

export default function OnboardingPage() {
  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-[480px] flex-col overflow-hidden bg-background">
      {/* Animated glow background */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
        <div className="animate-drift absolute -left-24 -top-24 h-80 w-80 rounded-full bg-accent/20 blur-[100px]" />
        <div className="animate-drift-slow absolute -right-20 top-1/3 h-72 w-72 rounded-full bg-violet-600/25 blur-[110px]" />
        <div className="animate-drift absolute bottom-10 left-1/4 h-72 w-72 rounded-full bg-fuchsia-500/15 blur-[120px]" />
      </div>

      <div className="relative z-10 flex flex-1 flex-col">
        <div className="flex-1 overflow-y-auto">
          <OnboardingIntro />
          <FeatureCarousel />
        </div>
        <OnboardingCTA />
      </div>
    </main>
  );
}
