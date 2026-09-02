import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CreateScreen } from "@/components/create/CreateScreen";

/**
 * The creator.
 *
 * This route used to be an orphaned menu of three cards that nothing linked
 * to — the (+) button had long since been replaced by CreateSheet, and this
 * page was left behind. It is now the fullscreen camera-first screen, and
 * (+) pushes straight here.
 */
export default async function CreatePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/signin");

  return <CreateScreen userId={user.id} />;
}
