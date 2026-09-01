import type { Metadata } from "next";
import { GateCard } from "@/components/auth/GateCard";

export const metadata: Metadata = {
  title: "Enter your code",
  // Belt and braces alongside the X-Robots-Tag header in next.config.ts.
  robots: { index: false, follow: false },
};

/**
 * The invite wall for app.hypefy.chat. Mirrors the (auth) layout's beam
 * background rather than living inside that route group, because the proxy
 * rewrites *every* ungated path here and a route group would drag its own
 * segment layout along.
 */
export default function GatePage() {
  return (
    <div className="relative w-full bg-black">
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
        <div className="animate-beam absolute -top-1/3 right-0 h-[120%] w-[70%] origin-top bg-[radial-gradient(ellipse_at_top,_rgba(255,255,255,0.16),_transparent_55%)] blur-2xl" />
        <div className="absolute -top-1/4 left-1/2 h-[80%] w-[40%] -translate-x-1/2 bg-[radial-gradient(ellipse_at_top,_rgba(255,255,255,0.08),_transparent_60%)] blur-3xl" />
      </div>

      <div className="relative z-10 flex min-h-dvh w-full flex-col items-center overflow-y-auto px-5 py-12">
        <div className="my-auto w-full max-w-[360px]">
          <GateCard />
        </div>
      </div>
    </div>
  );
}
