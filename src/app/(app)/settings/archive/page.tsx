import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { ArchiveList } from "@/components/profile/ArchiveList";
import { loadArchive } from "@/lib/post-controls";

export const metadata = { title: "Archive" };

/**
 * Posts and Shots taken off everything without being deleted.
 *
 * They are invisible to the whole app — feeds, profiles, search, tags,
 * sounds, anything shared in a chat — because the row rule hides them. This
 * screen asks the one function that can still see them, and it only ever
 * answers for the person asking.
 */
export default async function ArchivePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  return (
    <>
      <PageHeader title="Archive" showBack />
      <p className="px-5 pb-1 pt-2 text-xs text-muted">
        Only you can see these. Put one back and it returns where it was, with its hypes and comments.
      </p>
      <ArchiveList initial={await loadArchive(supabase)} />
    </>
  );
}
