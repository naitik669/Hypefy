import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile, hueFromId, DEFAULT_BANNER_ID } from "@/lib/profile";
import { PageHeader } from "@/components/ui/PageHeader";
import { EditProfileForm } from "@/components/settings/EditProfileForm";
import Link from "next/link";
import { ChevronRight, IdCard } from "lucide-react";

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
      {profile?.username && (
        <Link
          href={`/u/${profile.username}/card?edit=1`}
          className="mx-4 mt-3 flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 transition-colors hover:bg-elevated active:scale-[0.99]"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-accent/15 text-accent">
            <IdCard size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold">Profile card</span>
            <span className="block text-xs text-muted">Layout, colour and links</span>
          </span>
          <ChevronRight size={18} className="shrink-0 text-muted" />
        </Link>
      )}
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
          isPremium: profile?.isPremium ?? false,
        }}
      />
    </>
  );
}
