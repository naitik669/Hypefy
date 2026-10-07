import { cache } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { GoneScreen } from "@/components/empty/GoneScreen";
import { SoundHero } from "@/components/music/SoundHero";
import { ShotResultsGrid } from "@/components/search/ShotResultsGrid";
import { GRID, GRID_WRAP } from "@/components/profile/postGrid";
import { findSound, soundCountLine, SOUND_PAGE_SIZE, type SoundPost } from "@/lib/sound-lookup";

/**
 * One song, and everything on Hypefy made with it.
 *
 * Reached by tapping the song's name on a Shot or a post. It answers "what
 * is this, and what else used it", and it is where "Use this sound" lives:
 * the Shot composer, opened with the song already chosen.
 */

// One lookup for the metadata and the page.
const getSound = cache(async (trackId: string) => {
  const supabase = await createClient();
  return findSound(supabase, trackId);
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ trackId: string }>;
}): Promise<Metadata> {
  const { trackId } = await params;
  const sound = await getSound(trackId);
  if (!sound) return { title: "Sound" };
  const by = sound.track.artist ? ` · ${sound.track.artist}` : "";
  return {
    title: `${sound.track.title}${by}`,
    description: `Shots and posts on Hypefy made with ${sound.track.title}.`,
  };
}

function PostTile({ post }: { post: SoundPost }) {
  const image = post.image_urls?.[0] ?? post.image_url;
  const words = post.caption ?? post.body ?? "";
  return (
    <Link
      href={`/p/${post.id}`}
      aria-label={words ? `Post: ${words}` : "Post"}
      className="relative block overflow-hidden rounded-xl bg-surface"
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center p-2 text-[11px] leading-snug text-muted">
          <span className="line-clamp-5">{words}</span>
        </span>
      )}
    </Link>
  );
}

export default async function SoundPage({ params }: { params: Promise<{ trackId: string }> }) {
  const { trackId } = await params;
  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    sound,
  ] = await Promise.all([supabase.auth.getUser(), getSound(trackId)]);

  // Nothing the person asking can see uses it: every Shot with it was
  // deleted, or belongs to accounts they do not follow.
  if (!sound) return <GoneScreen kind="sound" />;

  const { track, shots, posts, shotCount, postCount } = sound;

  return (
    <>
      <PageHeader title="Sound" showBack />
      <SoundHero track={track} countLine={soundCountLine(shotCount, postCount)} canCreate={!!user} />

      <div className="flex flex-col gap-6 pb-24 pt-6">
        {shots.length > 0 && (
          <section>
            <h2 className="mb-2 px-4 text-xs font-bold uppercase tracking-widest text-faint">Shots</h2>
            <ShotResultsGrid shots={shots} />
          </section>
        )}
        {posts.length > 0 && (
          <section>
            <h2 className="mb-2 px-4 text-xs font-bold uppercase tracking-widest text-faint">Posts</h2>
            <div className={GRID_WRAP}>
              <div className={GRID}>
                {posts.map((p) => (
                  <PostTile key={p.id} post={p} />
                ))}
              </div>
            </div>
          </section>
        )}
        {(shotCount > SOUND_PAGE_SIZE || postCount > SOUND_PAGE_SIZE) && (
          <p className="px-8 text-center text-xs text-faint">Showing the newest {SOUND_PAGE_SIZE} of each.</p>
        )}
      </div>
    </>
  );
}
