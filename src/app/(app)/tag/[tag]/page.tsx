import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Hash } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ShotResultsGrid } from "@/components/search/ShotResultsGrid";
import { PostTileGrid } from "@/components/feed/PostTileGrid";
import { TagActions } from "@/components/tags/TagActions";
import { soundCountLine } from "@/lib/sound-lookup";
import { findTag, TAG_PAGE_SIZE } from "@/lib/tag-lookup";

/**
 * One hashtag, and everything under it.
 *
 * Reached by tapping a #tag in a caption, in Discover or in your topics.
 * It is where a tag is followed, and it is a link that can be shared.
 */

const getTag = cache(async (tag: string) => {
  const supabase = await createClient();
  return findTag(supabase, tag);
});

export async function generateMetadata({ params }: { params: Promise<{ tag: string }> }): Promise<Metadata> {
  const { tag } = await params;
  const page = await getTag(tag);
  if (!page) return { title: "Tag" };
  return { title: `#${page.tag}`, description: `Posts and Shots tagged #${page.tag} on Hypefy.` };
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 px-4 text-xs font-bold uppercase tracking-widest text-faint">{children}</h2>;
}

export default async function TagPage({ params }: { params: Promise<{ tag: string }> }) {
  const { tag: raw } = await params;
  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    page,
  ] = await Promise.all([supabase.auth.getUser(), getTag(raw)]);

  // Not a hashtag at all (spaces, punctuation): there is no such page.
  if (!page) notFound();

  const { data: follow } = user
    ? await supabase.from("hashtag_follows").select("tag").eq("user_id", user.id).eq("tag", page.tag).maybeSingle()
    : { data: null };

  const { tag, shots, top, recent, shotCount, postCount } = page;
  const empty = shots.length === 0 && top.length === 0 && recent.length === 0;
  const counts = soundCountLine(shotCount, postCount);

  return (
    <>
      <PageHeader title="Tag" showBack />

      <section className="flex flex-col gap-4 px-4 pt-4">
        <div className="flex items-center gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-surface text-accent">
            <Hash size={28} strokeWidth={2.4} />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-extrabold leading-tight tracking-tight">#{tag}</h1>
            <p className="mt-1 text-xs font-semibold text-faint">{counts || "Nothing here yet"}</p>
          </div>
        </div>
        <TagActions tag={tag} initialFollowing={!!follow} signedIn={!!user} />
      </section>

      <div className="flex flex-col gap-6 pb-24 pt-6">
        {empty && (
          <EmptyState
            icon={Hash}
            title={`Nothing under #${tag} yet`}
            text="Follow it and the first post to use it lands in your feed. Or be the first."
            ctaLabel={user ? "Write a post" : undefined}
            ctaHref={user ? "/create/post" : undefined}
            variant="compact"
          />
        )}
        {shots.length > 0 && (
          <section>
            <Heading>Shots</Heading>
            <ShotResultsGrid shots={shots} />
          </section>
        )}
        {top.length > 0 && (
          <section>
            <Heading>Top</Heading>
            <PostTileGrid posts={top} />
          </section>
        )}
        {recent.length > 0 && (
          <section>
            <Heading>{top.length > 0 ? "Recent" : "Posts"}</Heading>
            <PostTileGrid posts={recent} />
          </section>
        )}
        {(shotCount > TAG_PAGE_SIZE || postCount > TAG_PAGE_SIZE) && (
          <p className="px-8 text-center text-xs text-faint">Showing the newest {TAG_PAGE_SIZE} of each.</p>
        )}
      </div>
    </>
  );
}
