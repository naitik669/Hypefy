import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile, hueFromId, DEFAULT_BANNER_ID } from "@/lib/profile";
import { ProfileSetupForm } from "@/components/profile/ProfileSetupForm";

export default async function SetupProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/signin");

  const profile = await getProfile(supabase);

  // Suggest a username seed from the email local-part.
  const emailSeed =
    user.email?.split("@")[0]?.toLowerCase().replace(/[^a-z0-9_.]/g, "") ?? "";

  const initial = {
    displayName: profile?.displayName ?? "",
    username: profile?.username ?? emailSeed,
    bio: profile?.bio ?? "",
    vibe: profile?.currentVibe ?? "",
    avatarHue: profile?.avatarHue ?? hueFromId(user.id),
    bannerId: profile?.bannerId ?? DEFAULT_BANNER_ID,
    interests: profile?.interests ?? [],
  };

  return (
    <main className="relative mx-auto min-h-dvh w-full max-w-[480px] bg-background">
      <ProfileSetupForm userId={user.id} initial={initial} />
    </main>
  );
}
