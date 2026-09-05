import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Folder } from "lucide-react";
import { CollectionActions } from "@/components/profile/CollectionActions";

/**
 * One collection, on a route.
 *
 * CollectionModal was already a page in everything but the URL — its own
 * header, its own back chevron, its own title bar — and tapping any item
 * inside it navigated to /p/[id] and destroyed the view with no way back.
 *
 * It also could not show its own contents. The modal intersected the
 * collection's item ids against the caller's saved-posts array, which the
 * profile tab had capped at 30 — so an item saved long enough ago was
 * invisible inside the very folder it had been filed in. This reads the
 * collection directly, so what is in it is what you see.
 */
export default async function CollectionPage({
  params,
}: {
  params: Promise<{ collectionId: string }>;
}) {
  const { collectionId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { data: collection } = await supabase
    .from("collections")
    .select("id, name, user_id")
    .eq("id", collectionId)
    .maybeSingle();

  // RLS scopes collections to their owner, so a miss is either "gone" or
  // "not yours" — both are a 404 from here.
  if (!collection) notFound();

  const { data: items } = await supabase
    .from("collection_items")
    .select("created_at, posts(id, image_url, image_urls, caption)")
    .eq("collection_id", collectionId)
    .order("created_at", { ascending: false });

  const posts = (items ?? []).flatMap((r: Record<string, unknown>) => {
    const p = Array.isArray(r.posts) ? r.posts[0] : r.posts;
    if (!p) return [];
    const post = p as Record<string, unknown>;
    return [
      {
        id: post.id as string,
        thumb:
          ((post.image_urls as string[] | null)?.[0] ??
            (post.image_url as string | null)) ?? null,
        caption: (post.caption as string) ?? null,
      },
    ];
  });

  return (
    <>
      <PageHeader
        title={collection.name as string}
        showBack
        right={
          <CollectionActions
            collectionId={collection.id as string}
            name={collection.name as string}
          />
        }
      />

      {posts.length === 0 ? (
        <EmptyState
          icon={Folder}
          title="Nothing in here yet"
          text="Add saved posts to this collection to keep them together."
          ctaLabel="Go to Saved"
          ctaHref="/saved"
          variant="compact"
        />
      ) : (
        <div className="grid grid-cols-3 gap-0.5 p-0.5">
          {posts.map((p) => (
            <Link
              key={p.id}
              href={`/p/${p.id}`}
              className="relative aspect-square overflow-hidden bg-surface"
            >
              {p.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.thumb}
                  alt={p.caption ?? ""}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center px-2 text-center text-[11px] leading-tight text-muted">
                  {p.caption?.slice(0, 60) ?? "Post"}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
