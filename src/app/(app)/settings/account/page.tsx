import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { SignOutButton } from "@/components/SignOutButton";

export default async function AccountSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  return (
    <>
      <PageHeader title="Account" showBack />
      <div className="flex flex-col gap-4 px-5 pt-4">
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Email</p>
          <p className="mt-1 text-sm">{user.email ?? "—"}</p>
        </div>
        <p className="px-1 text-xs text-muted">
          Email and password changes are coming soon. For now you can sign out below.
        </p>
        <SignOutButton />
      </div>
    </>
  );
}
