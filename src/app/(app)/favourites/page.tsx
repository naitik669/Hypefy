import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { CircleList } from "@/components/profile/CircleList";
import { fetchCircle } from "@/lib/circles";

/**
 * Your Favourites — the same gap as Hypers, minus even the prompt: there was
 * no surface at all that suggested anyone, so the Favourites feed tab could
 * only ever be empty unless you found the ··· menu on a profile.
 */
export const dynamic = "force-dynamic";

export default async function FavouritesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const people = await fetchCircle(supabase, "favourites", user.id);

  return (
    <>
      <PageHeader title="Favourites" showBack />
      <CircleList kind="favourites" currentUserId={user.id} initial={people} />
    </>
  );
}
