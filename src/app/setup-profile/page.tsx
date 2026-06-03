import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile, hueFromId } from "@/lib/profile";
import { SetupStepper } from "@/components/onboarding/SetupStepper";

export default async function SetupProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/signin");

  const profile = await getProfile(supabase);

  // Seed username from email local-part
  const emailSeed =
    user.email?.split("@")[0]?.toLowerCase().replace(/[^a-z0-9_.]/g, "") ?? "";

  const initial = {
    displayName: profile?.displayName ?? "",
    username: profile?.username ?? emailSeed,
    bio: profile?.bio ?? "",
    tags: profile?.profileTags ?? [],
    avatarHue: profile?.avatarHue ?? hueFromId(user.id),
    avatarUrl: profile?.avatarUrl ?? null,
  };

  return (
    <main className="relative mx-auto w-full max-w-[480px] bg-background">
      <SetupStepper userId={user.id} initial={initial} />
    </main>
  );
}
