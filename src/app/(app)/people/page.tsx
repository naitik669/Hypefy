import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { PeopleGrid } from "@/components/people/PeopleGrid";
import { loadPeopleSuggestions } from "@/lib/people-suggestions";

/**
 * People: pages of follow tiles, swiped sideways.
 *
 * Ranked by @hypefy/core/people-rank from mutuals, who follows you, what you
 * have both hyped and who has been around this week. Every tile says which
 * of those put it there.
 */
export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const people = await loadPeopleSuggestions(supabase, user.id);

  return (
    <>
      <PageHeader title="People" showBack />
      <div className="mx-auto w-full max-w-5xl pb-10">
        <div className="px-5 pb-5 pt-4 md:px-6 md:pt-8">
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight md:text-[30px]">
            Find your people to hype with!
          </h1>
          <p className="mt-2 text-[13px] text-muted md:text-sm">Hypefy is better with your people.</p>
        </div>
        <PeopleGrid people={people} />
      </div>
    </>
  );
}
