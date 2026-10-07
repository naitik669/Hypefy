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

  const [{ data: folder }, { data: rows }, { data: role }] = await Promise.all([
    supabase
      .from("collections")
      .select("id, user_id, name, emoji, color, position, cover_url")
      .eq("id", collectionId)
      .maybeSingle(),
    supabase
      .from("collection_items")
      .select(FOLDER_ITEM_COLS)
      .eq("collection_id", collectionId)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.rpc("collection_role", { p_collection: collectionId }),
  ]);

  // Row security shows a playlist to its owner and to people who joined it,
  // so a miss is "gone" or "not yours". Someone invited who has not answered
  // can see that it exists and nothing in it: they answer from the Library.
  if (!folder) notFound();
  if (role !== "owner" && role !== "editor") redirect("/library");

  const { data: owner } =
    role === "owner"
      ? { data: null }
      : await supabase.from("profiles").select("username").eq("id", folder.user_id).maybeSingle();

  const items = ((rows ?? []) as unknown as Record<string, unknown>[]).flatMap((r) => folderItem(r) ?? []) as SavedItem[];

  return (
    <FolderScreen
      userId={user.id}
      role={role}
      initialFolder={toFolder({
        ...folder,
        item_count: items.length,
        covers: [],
        is_owner: role === "owner",
        owner_username: (owner?.username as string | null | undefined) ?? null,
      })}
      initialItems={items}
    />
  );
}
