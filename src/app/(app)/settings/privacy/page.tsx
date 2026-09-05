import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { PrivacySettings } from "@/components/settings/PrivacySettings";
import { BlockedList } from "@/components/settings/BlockedList";
import { AppLockSettings } from "@/components/settings/AppLockSettings";

export default async function PrivacySettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_private, dm_privacy, show_activity, hide_read_receipts, two_step_enabled")
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
          initialHideReadReceipts={!!(profile as any)?.hide_read_receipts}
          initialTwoStep={!!(profile as any)?.two_step_enabled}
        />

        {/* App lock — migration 0031 shipped the whole backend and no UI. */}
        <div className="mt-8">
          <AppLockSettings />
        </div>

        {/* Blocked accounts */}
        <section className="mt-8">
          <p className="mb-1 px-1 text-xs font-bold uppercase tracking-widest text-faint">
            Blocked accounts
          </p>
          <BlockedList currentUserId={user.id} />
        </section>
      </div>
    </>
  );
}
