import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { ActivityScreen } from "@/components/profile/ActivityScreen";
import { isActivityTab, loadActivityTab } from "@/lib/your-activity";

export const metadata = { title: "Your interactions" };
export const dynamic = "force-dynamic";

/**
 * Your interactions: what you hyped, said, watched and rehyped.
 *
 * One tab is loaded at a time, named in the address, so a link can point at
 * a particular list and nothing is fetched to sit behind a tab nobody opened.
 */
export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const which = isActivityTab(tab) ? tab : "hypes";
  const { items, comments } = await loadActivityTab(supabase, user.id, which);

  return (
    <>
      <PageHeader title="Your interactions" showBack />
      <ActivityScreen tab={which} items={items} comments={comments} userId={user.id} />
    </>
  );
}
