import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { TwoFactorSection } from "@/components/settings/TwoFactorSection";

/**
 * Security, which used to be one toggle at the bottom of Privacy.
 *
 * Those are different questions. Privacy is who can see and reach you;
 * security is whether someone holding your password can get in. Burying the
 * second inside the first is how it ended up as a switch nobody trusted and
 * nothing enforced.
 */
export default async function SecuritySettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  // Recovery needs the service-role key to delete a factor for someone who has
  // lost their phone. Without it, offering enrollment would be handing people
  // a lock with no spare key — so the component refuses instead.
  const recoveryConfigured = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  return (
    <>
      <PageHeader title="Security" showBack />
      <div className="flex flex-col gap-4 px-4 pb-10 pt-4">
        <TwoFactorSection
          userId={user.id}
          recoveryConfigured={recoveryConfigured}
        />
      </div>
    </>
  );
}
