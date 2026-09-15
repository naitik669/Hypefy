import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { StyleEditor } from "@/components/billing/StyleEditor";

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

  const [{ data: me }, { data: owned }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name, username, avatar_url, avatar_hue, banner_id, banner_url, banner_colors, is_premium, is_verified, name_font, name_glow, avatar_decoration, bubble_style, nameplate")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("purchases").select("product_id").eq("user_id", user.id),
  ]);
  if (!me) redirect("/");

  return (
    <>
      <PageHeader title="Your style" showBack />
      <StyleEditor me={me} owned={(owned ?? []).map((o) => o.product_id)} wear={wear ?? null} />
    </>
  );
}
