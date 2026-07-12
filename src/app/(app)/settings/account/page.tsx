import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { SignOutButton } from "@/components/SignOutButton";
import { AccountForms } from "@/components/settings/AccountForms";
import { DeleteAccount } from "@/components/settings/DeleteAccount";
import { DataExport } from "@/components/settings/DataExport";

export default async function AccountSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <>
      <PageHeader title="Account" showBack />
      <div className="flex flex-col gap-6 px-5 pb-10 pt-4">
        <AccountForms currentEmail={user.email ?? ""} />
        <DataExport />
        <SignOutButton />
        <DeleteAccount username={(profile as any)?.username ?? null} />
      </div>
    </>
  );
}
