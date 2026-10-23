import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentUser } from "@/lib/auth-user";
import { getProfile } from "@/lib/profile";

/**
 * Smart entry router:
 *  - logged out            → /onboarding
 *  - logged in, incomplete → /setup-profile
 *  - logged in, complete    → /home
 */
export default async function RootPage() {
  const supabase = await createClient();
  const user = await currentUser();

  if (!user) redirect("/onboarding");

  const profile = await getProfile(supabase, user);
  if (!profile?.profileCompleted) redirect("/setup-profile");

  redirect("/home");
}
