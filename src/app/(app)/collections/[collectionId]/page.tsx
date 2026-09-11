import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FolderScreen } from "@/components/saved/FolderScreen";
import { toFolder } from "@/lib/folders";
import { FOLDER_ITEM_COLS, folderItem, type SavedItem } from "@/lib/saved";

/**
 * One saved folder, on a route (the database, and this URL, still call
 * folders collections).
 *
 * Reads the folder directly, so what is in it is what you see — the modal
 * this replaced intersected its ids with a capped list of saves, and older
 * things went missing from the folder they were filed in.
 */
export const dynamic = "force-dynamic";

export default async function FolderPage({ params }: { params: Promise<{ collectionId: string }> }) {
  const { collectionId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const [{ data: folder }, { data: rows }] = await Promise.all([
    supabase.from("collections").select("id, name, emoji, color, position, cover_url").eq("id", collectionId).maybeSingle(),
    supabase
      .from("collection_items")
      .select(FOLDER_ITEM_COLS)
      .eq("collection_id", collectionId)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  // RLS scopes folders to their owner, so a miss is either "gone" or "not
  // yours" — both are a 404 from here.
  if (!folder) notFound();

  const items = ((rows ?? []) as unknown as Record<string, unknown>[]).flatMap((r) => folderItem(r) ?? []) as SavedItem[];

  return (
    <FolderScreen
      userId={user.id}
      initialFolder={toFolder({ ...folder, item_count: items.length, covers: [] })}
      initialItems={items}
    />
  );
}
