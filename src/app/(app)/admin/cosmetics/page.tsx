import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { CosmeticsAdmin, type ProductRow } from "@/components/admin/CosmeticsAdmin";

/**
 * Owner-only cosmetics desk: upload a frame, place it over an avatar, and
 * edit anything already in the catalogue.
 *
 * Everyone else gets a 404, not a hint — the same gate the reports queue
 * uses, and the same reason: a 403 tells you the page exists.
 */
export const dynamic = "force-dynamic";

export default async function AdminCosmeticsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  // Fail closed: a failed lookup must not fall through into the desk.
  const { data: isAdmin, error: meErr } = await supabase.rpc("is_admin");
  if (meErr || isAdmin !== true) notFound();

  const { data: products } = await supabase
    .from("products")
    .select("id, kind, tier, name, price_paise, active, sort, asset_path, scale, offset_x, offset_y")
    .order("kind", { ascending: true })
    .order("sort", { ascending: true });

  const { data: me } = await supabase
    .from("profiles")
    .select("avatar_url, avatar_hue, display_name, username")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <>
      <PageHeader title="Cosmetics" showBack />
      <CosmeticsAdmin
        products={(products ?? []) as ProductRow[]}
        bucketBase={`${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/cosmetics/`}
        preview={{
          avatarUrl: me?.avatar_url ?? null,
          hue: me?.avatar_hue ?? 200,
          name: me?.display_name ?? me?.username ?? "You",
        }}
      />
    </>
  );
}
