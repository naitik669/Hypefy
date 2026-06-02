import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function OnboardingCTA() {
  return (
    <div className="sticky bottom-0 z-10 mt-6 bg-gradient-to-t from-background via-background to-transparent px-6 pb-8 pt-4">
      <Link
        href="/signup"
        className="flex h-14 w-full items-center justify-center gap-2 rounded-pill bg-accent text-base font-bold text-accent-ink shadow-[0_0_28px_2px_rgba(200,255,0,0.4)] transition-transform active:scale-[0.98]"
      >
        Get Hyped
        <ArrowRight size={20} strokeWidth={2.6} />
      </Link>
      <p className="mt-4 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/signin" className="font-semibold text-foreground">
          Sign in
        </Link>
      </p>
    </div>
  );
}
