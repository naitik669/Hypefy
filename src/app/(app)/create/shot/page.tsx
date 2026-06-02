import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { ShotComposer } from "@/components/post/ShotComposer";

export default async function CreateShotPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  return (
    <>
      <PageHeader title="Add Shot" showBack />
      <ShotComposer userId={user.id} />
    </>
  );
}
