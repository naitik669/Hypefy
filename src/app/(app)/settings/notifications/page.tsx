import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { NotificationPrefs, type NotifPrefs } from "@/components/settings/NotificationPrefs";

export default async function NotificationSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { data: profile } = await supabase
    .from("profiles")
    .select("notif_prefs")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <>
      <PageHeader title="Notifications" showBack />
      <div className="px-4 pb-10 pt-3">
        <NotificationPrefs
          userId={user.id}
          initialPrefs={((profile as any)?.notif_prefs ?? {}) as NotifPrefs}
        />
      </div>
    </>
  );
}
