import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPrivateProfile } from "@/lib/profile";
import { PageHeader } from "@/components/ui/PageHeader";
import { PrivacySettings } from "@/components/settings/PrivacySettings";
import { BlockedList } from "@/components/settings/BlockedList";
import { MutedList } from "@/components/settings/MutedList";
import { AppLockSettings } from "@/components/settings/AppLockSettings";
import { ChatLockSettings } from "@/components/vault/ChatLockSettings";
import { SettingsCard, SettingsRow } from "@/components/settings/SettingsCard";
import { ShieldCheck } from "lucide-react";

export default async function PrivacySettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  // The mention rule is nobody else's business, so it is not a column
  // anyone can read — it comes with the rest of this person's own fields.
  const [{ data: profile }, mine] = await Promise.all([
    supabase
      .from("profiles")
      .select("is_private, dm_privacy, show_activity, hide_read_receipts, show_hypes")
      .eq("id", user.id)
      .maybeSingle(),
    getPrivateProfile(supabase),
  ]);

  return (
    <>
      <PageHeader title="Privacy" showBack />
      <div className="px-4 pb-10 pt-4">
        <PrivacySettings
          userId={user.id}
          initialIsPrivate={!!(profile as any)?.is_private}
          initialDmPrivacy={
            ((profile as any)?.dm_privacy ?? "everyone") as
              | "everyone"
              | "following"
          }
          initialShowActivity={(profile as any)?.show_activity ?? true}
          initialHideReadReceipts={!!(profile as any)?.hide_read_receipts}
          initialShowHypes={(profile as any)?.show_hypes ?? true}
          initialMentionPrivacy={mine?.mentionPrivacy ?? "everyone"}
        />

        {/* Two-factor moved to its own page. Left as a pointer rather than
            silently vanishing: this is where it used to live, and it is what
            people who came here looking for "security" are after. */}
        <div className="mt-8">
          <p className="mb-2 px-1 text-xs font-bold uppercase tracking-widest text-faint">
            Security
          </p>
          <SettingsCard>
            <SettingsRow
              href="/settings/security"
              label="Two-factor authentication"
              sub="A code from your authenticator app, on top of your password"
              icon={ShieldCheck}
            />
          </SettingsCard>
        </div>

        {/* App lock — migration 0031 shipped the whole backend and no UI. */}
        <div className="mt-8">
          <AppLockSettings />
        </div>

        {/* Chat lock and the Vault. The only place the app says how the Vault
            is opened: it has no button of its own. */}
        <div className="mt-8">
          <ChatLockSettings />
        </div>

        {/* Blocked accounts */}
        <section className="mt-8">
          <p className="mb-1 px-1 text-xs font-bold uppercase tracking-widest text-faint">
            Blocked accounts
          </p>
          <BlockedList currentUserId={user.id} />
        </section>

        {/* Muted accounts: lighter than a block, and theirs to undo here. */}
        <section className="mt-8">
          <p className="mb-1 px-1 text-xs font-bold uppercase tracking-widest text-faint">
            Muted accounts
          </p>
          <MutedList currentUserId={user.id} />
        </section>
      </div>
    </>
  );
}
