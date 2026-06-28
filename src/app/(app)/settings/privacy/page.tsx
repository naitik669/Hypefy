import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { PrivacySettings } from "@/components/settings/PrivacySettings";

export default async function PrivacySettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_private, dm_privacy, show_activity")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <>
      <PageHeader title="Privacy" showBack />
      <div className="px-4 pb-10 pt-4">
        <PrivacySettings
          userId={user.id}
          initialIsPrivate={!!(profile as any)?.is_private}
          initialDmPrivacy={((profile as any)?.dm_privacy ?? "everyone") as "everyone" | "following"}
          initialShowActivity={(profile as any)?.show_activity ?? true}
        />
      </div>
    </>
  );
}
