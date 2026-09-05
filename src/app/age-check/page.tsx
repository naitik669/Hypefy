import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { AgeCheck } from "@/components/auth/AgeCheck";

/**
 * The one-time age prompt, for accounts that arrived without a date of birth.
 *
 * Deliberately OUTSIDE the (app) route group: the app layout redirects here,
 * so living inside it would loop.
 */
export const dynamic = "force-dynamic";

export default async function AgeCheckPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  // Already answered — nothing to ask.
  const profile = await getProfile(supabase);
  if (profile?.dateOfBirth) redirect("/home");

  return <AgeCheck />;
}
