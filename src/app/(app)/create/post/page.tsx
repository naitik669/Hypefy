import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { PostComposer } from "@/components/post/PostComposer";

export default async function CreatePostPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  return (
    <>
      <PageHeader title="New Post" showBack />
      <PostComposer userId={user.id} />
    </>
  );
}
