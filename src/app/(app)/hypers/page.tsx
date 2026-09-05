import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { CircleList } from "@/components/profile/CircleList";
import { fetchCircle } from "@/lib/circles";

/**
 * Your Hypers.
 *
 * The feature had a feed tab, two ways to add someone and no list — once you
 * had one Hyper there was no surface anywhere that told you who they were, let
 * alone let you change it.
 */
export const dynamic = "force-dynamic";

export default async function HypersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const people = await fetchCircle(supabase, "hypers", user.id);

  return (
    <>
      <PageHeader title="Hypers" showBack />
      <CircleList kind="hypers" currentUserId={user.id} initial={people} />
    </>
  );
}
