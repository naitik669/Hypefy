import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentUser } from "@/lib/auth-user";
import { getProfile } from "@/lib/profile";
import { IntroCarousel } from "@/components/onboarding/IntroCarousel";

/**
 * Intro slides. Route guard:
 *  - logged-in + complete profile → /home
 *  - logged-in + incomplete       → /setup-profile
 *  - logged-out                   → show the intro carousel
 */
export default async function OnboardingPage() {
  const supabase = await createClient();
  const user = await currentUser();

  if (user) {
    const profile = await getProfile(supabase, user);
    redirect(profile?.profileCompleted ? "/home" : "/setup-profile");
  }

  return <IntroCarousel />;
}
