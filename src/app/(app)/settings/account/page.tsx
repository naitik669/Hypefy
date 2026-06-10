import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { SignOutButton } from "@/components/SignOutButton";
import { AccountForms } from "@/components/settings/AccountForms";

export default async function AccountSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  return (
    <>
      <PageHeader title="Account" showBack />
      <div className="flex flex-col gap-6 px-5 pb-10 pt-4">
        <AccountForms currentEmail={user.email ?? ""} />
        <SignOutButton />
      </div>
    </>
  );
}
