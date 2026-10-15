import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { StyleEditor } from "@/components/billing/StyleEditor";
import { loadFrames } from "@/lib/frames-load";

export const metadata = { title: "Your style" };

export default async function StylePage({
  searchParams,
}: {
  searchParams: Promise<{ wear?: string }>;
}) {
  const { wear } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const [{ data: me }, { data: owned }, frames] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name, username, avatar_url, avatar_hue, banner_id, banner_url, is_premium, is_verified, name_font, name_glow, avatar_decoration, bubble_style, nameplate")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("purchases").select("product_id").eq("user_id", user.id),
    loadFrames(),
  ]);
  if (!me) redirect("/");

  return (
    <>
      <PageHeader title="Your style" showBack />
      <StyleEditor
        me={me}
        owned={(owned ?? []).map((o) => o.product_id)}
        wear={wear ?? null}
        frames={Object.values(frames)
          .filter((f) => f.url)
          .map((f) => ({ id: f.id, label: f.label, tier: f.tier }))}
      />
    </>
  );
}
