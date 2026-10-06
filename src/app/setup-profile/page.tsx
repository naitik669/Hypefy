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

  const initial = {
    displayName: profile?.displayName ?? "",
    // Empty until they have one. It was pre-filled from their email address,
    // which put most of that address on a public profile; the stepper
    // suggests one from the name they choose to show instead.
    username: profile?.username ?? "",
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
