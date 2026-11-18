import { router } from "expo-router";
import { IntroCarousel } from "@/onboarding/IntroCarousel";

/**
 * The signed-out front door, as the web has it at /onboarding.
 *
 * Reachable on its own route for now rather than replacing the session
 * screen, because that screen is what proves Phase 5's criterion and is
 * still the only way to sign in on the phone. The real wiring — signed
 * out lands here, "Get Hyped" goes to sign-up — comes with the auth
 * screens.
 */
export default function Onboarding() {
  return <IntroCarousel onFinish={() => router.back()} />;
}
