import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { FeedCard, type FeedPost } from "@/components/feed/FeedCard";

type Thumb = { id: string; image_url: string | null; image_urls: string[] | null; caption: string | null };

function cover(p: Thumb): string | null {
  return p.image_url ?? p.image_urls?.[0] ?? null;
}

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const { postId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const uid = user?.id ?? "";

  // The single target post (this is what an embed/chat link should open).
  const { data: raw } = await supabase.from("posts").select("*").eq("id", postId).maybeSingle();
  if (!raw) notFound();
  const ownerId = (raw as any).user_id as string;
  const isOwn = uid === ownerId;

  // Author profile (fetched separately — embedding it in the single-row query
  // above intermittently returned null).
  const { data: ownerProf } = await supabase
    .from("profiles")
    .select("id, display_name, username, avatar_hue, avatar_url, profile_tags, is_verified")
    .eq("id", ownerId)
    .maybeSingle();

  // Can the viewer see the owner's other posts? (private + non-follower → no)
  let canSeeMore = isOwn;
  if (!canSeeMore) {
    const { data: ownerProfile } = await supabase.from("profiles").select("is_private").eq("id", ownerId).maybeSingle();
    if (!ownerProfile?.is_private) canSeeMore = true;
    else if (uid) {
      const { data: followRow } = await supabase
        .from("follows").select("id").eq("follower_id", uid).eq("following_id", ownerId).maybeSingle();
      canSeeMore = !!followRow;
    }
  }

  // Hype/save state for the target post
  const [hypeRes, saveRes] = uid
    ? await Promise.all([
        supabase.from("hypes").select("target_id").eq("user_id", uid).eq("target_type", "post").eq("target_id", postId).maybeSingle(),
        supabase.from("saved_posts").select("post_id").eq("user_id", uid).eq("post_id", postId).maybeSingle(),
      ])
    : [{ data: null }, { data: null }];

  const post: FeedPost = {
    ...(raw as any),
    profiles: (ownerProf as any) ?? null,
    initialHyped: !!hypeRes.data,
    initialSaved: !!saveRes.data,
  };
  const username = post.profiles?.username ?? null;
  const hashtags = ((raw as any).hashtags ?? []) as string[];

  // "More from @username" + "More like this" — only when the viewer may see more.
  let moreFrom: Thumb[] = [];
  let moreLike: Thumb[] = [];
  if (canSeeMore) {
    const [fromRes, likeRes] = await Promise.all([
      supabase
        .from("posts")
        .select("id, image_url, image_urls, caption")
        .eq("user_id", ownerId)
        .neq("id", postId)
        .order("created_at", { ascending: false })
        .limit(12),
      hashtags.length > 0
        ? supabase
            .from("posts")
            .select("id, image_url, image_urls, caption")
            .overlaps("hashtags", hashtags)
            .neq("user_id", ownerId)
            .neq("id", postId)
            .order("hype_count", { ascending: false })
            .limit(12)
        : supabase
            .from("posts")
            .select("id, image_url, image_urls, caption")
            .neq("user_id", ownerId)
            .neq("id", postId)
            .order("hype_count", { ascending: false })
            .limit(12),
    ]);
    moreFrom = (fromRes.data ?? []) as Thumb[];
    moreLike = (likeRes.data ?? []) as Thumb[];
  }

  return (
    <>
      <PageHeader title="Post" showBack />
      <FeedCard post={post} currentUserId={uid} />

      {moreFrom.length > 0 && (
        <ThumbSection title={username ? `More from @${username}` : "More from this person"} items={moreFrom} />
      )}
      {moreLike.length > 0 && <ThumbSection title="More like this" items={moreLike} />}
    </>
  );
}

function ThumbSection({ title, items }: { title: string; items: Thumb[] }) {
  return (
    <section className="mt-2 border-t border-border/60 pt-3">
      <h2 className="px-4 pb-2 text-sm font-bold tracking-tight">{title}</h2>
      <div className="grid grid-cols-3 gap-1.5 px-1.5 pb-2">
        {items.map((p) => {
          const c = cover(p);
          return (
            <Link key={p.id} href={`/p/${p.id}`} className="relative block aspect-square overflow-hidden rounded-xl bg-surface">
              {c ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c} alt={p.caption ?? "Post"} loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-end p-2">
                  <p className="line-clamp-3 text-[10px] text-muted">{p.caption ?? ""}</p>
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
