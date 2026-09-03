import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile, hueFromId, DEFAULT_BANNER_ID } from "@/lib/profile";
import { PageHeader } from "@/components/ui/PageHeader";
import { EditProfileForm } from "@/components/settings/EditProfileForm";

export default async function EditProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const profile = await getProfile(supabase);

  return (
    <>
      <PageHeader title="Edit profile" showBack />
      <p className="px-5 pb-1 pt-1 text-sm text-muted">
        Update how you appear on Hypefy.
      </p>
      <EditProfileForm
        userId={user.id}
        initial={{
          displayName: profile?.displayName ?? "",
          username: profile?.username ?? "",
          bio: profile?.bio ?? "",
          avatarHue: profile?.avatarHue ?? hueFromId(user.id),
          avatarUrl: profile?.avatarUrl ?? null,
          bannerId: profile?.bannerId ?? DEFAULT_BANNER_ID,
          bannerUrl: profile?.bannerUrl ?? null,
          profileTags: profile?.profileTags ?? [],
          interests: profile?.interests ?? [],
          accentId: profile?.accentId ?? null,
        }}
      />
    </>
  );
}
