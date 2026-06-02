import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";

/**
 * Smart entry router:
 *  - logged out            → /onboarding
 *  - logged in, incomplete → /setup-profile
 *  - logged in, complete    → /home
 */
export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/onboarding");

  const profile = await getProfile(supabase);
  if (!profile?.profileCompleted) redirect("/setup-profile");

  redirect("/home");
}
