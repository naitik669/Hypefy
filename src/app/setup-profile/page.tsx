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
    vibe: profile?.currentVibe ?? "",
    avatarHue: profile?.avatarHue ?? hueFromId(user.id),
  };

  return (
    <main className="relative mx-auto w-full max-w-[480px] bg-background">
      {/* Subtle glow */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 max-w-[480px]">
        <div className="animate-drift absolute -left-24 top-1/4 h-72 w-72 rounded-full bg-accent/10 blur-[120px]" />
      </div>
      <div className="relative z-10">
        <SetupStepper userId={user.id} initial={initial} />
      </div>
    </main>
  );
}
