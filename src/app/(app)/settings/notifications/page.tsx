import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { NotificationPrefs, type NotifPrefs } from "@/components/settings/NotificationPrefs";
import { PushToggle } from "@/components/pwa/PushToggle";

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
      <div className="flex flex-col gap-6 px-4 pb-10 pt-3">
        <section>
          <p className="mb-1 px-1 text-xs font-bold uppercase tracking-widest text-faint">
            This device
          </p>
          <PushToggle userId={user.id} />
        </section>

        <section>
          <p className="mb-1 px-1 text-xs font-bold uppercase tracking-widest text-faint">
            What pings you
          </p>
          <NotificationPrefs
            userId={user.id}
            initialPrefs={((profile as any)?.notif_prefs ?? {}) as NotifPrefs}
          />
        </section>
      </div>
    </>
  );
}
