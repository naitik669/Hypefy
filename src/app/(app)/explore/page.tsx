import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { Avatar } from "@/components/ui/Avatar";
import { VerifiedStar } from "@/components/ui/VerifiedStar";

/**
 * The public face of Hypefy.
 *
 * Everything else a stranger can open — a profile, a post, a shot — is a deep
 * link: reachable if you were handed the URL, invisible otherwise. Nothing on
 * the site led to any of it, so a visitor who arrived at the front door found
 * an intro carousel, a sign-up form, and no way further in. That is also what
 * an ad network's reviewer found, and why the site reads as empty.
 *
 * This page is the path. It is deliberately NOT the search grid or Discover's
 * masonry, even though both look better: those are browse surfaces for someone
 * already inside, and they render pictures with the words hidden behind a
 * press. A page whose job is to be READ — by a stranger deciding what this is,
 * and by a crawler deciding whether there is anything here — has to carry its
 * text in the markup. Hence server-rendered, hence captions shown rather than
 * peeked, hence real links on every tile.
 *
 * It shows only what an anonymous visitor may see, because it runs as one:
 * RLS is the filter, so private profiles and removed posts fall out on their
 * own rather than by a list someone has to maintain.
 */

export const metadata = {
  title: "Explore Hypefy",
  description:
    "Recent posts and profiles from Hypefy — a social space where your profile is the canvas, not a template.",
  alternates: { canonical: "https://app.hypefy.chat/explore" },
};

/** Re-read hourly. New posts matter; a live query per visitor does not. */
export const revalidate = 3600;

const POSTS = 24;
const PEOPLE = 12;

function firstImage(p: {
  image_urls?: string[] | null;
  image_url?: string | null;
}): string | null {
  return p.image_urls?.[0] ?? p.image_url ?? null;
}

export default async function ExplorePage() {
  const supabase = await createClient();

  const [postsRes, peopleRes] = await Promise.all([
    supabase
      .from("posts")
      .select(
        "id, caption, body, image_url, image_urls, created_at, hype_count, profiles!posts_user_id_fkey(username, display_name, avatar_hue, avatar_url, is_verified)"
      )
      .is("removed_at", null)
      .order("created_at", { ascending: false })
      .limit(POSTS * 2),
    supabase
      .from("profiles")
      .select("username, display_name, bio, avatar_hue, avatar_url, is_verified")
      .not("username", "is", null)
      .eq("is_private", false)
      .is("suspended_at", null)
      .order("updated_at", { ascending: false })
      .limit(PEOPLE),
  ]);

  const posts = (postsRes.data ?? [])
    .map((p: any) => ({
      ...p,
      profiles: Array.isArray(p.profiles) ? p.profiles[0] ?? null : p.profiles,
    }))
    // A tile with no picture is a grey square, and a grid of those says less
    // about Hypefy than fewer tiles would.
    .filter((p: any) => firstImage(p))
    .slice(0, POSTS);

  const people = peopleRes.data ?? [];

  return (
    <main className="pb-16">
      <header className="px-4 pt-8 pb-6">
        <Link href="/" className="text-xl font-black tracking-tight">
          Hypefy<span className="text-accent">.</span>
        </Link>
        <h1 className="mt-5 text-2xl font-bold leading-tight">
          Everyone posts differently. Why do profiles look the same?
        </h1>
        <p className="mt-2 text-sm leading-snug text-muted">
          Hypefy turns the profile itself into a canvas — themes, banners,
          frames and effects, so no two read alike. Here is what people are
          posting.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link
            href="/gate"
            className="rounded-pill bg-accent px-4 py-2 text-sm font-bold text-accent-ink"
          >
            I have a code
          </Link>
          <a
            href="https://hypefy.chat"
            className="rounded-pill border border-border px-4 py-2 text-sm font-semibold text-muted"
          >
            Join the waitlist
          </a>
        </div>
      </header>

      {posts.length > 0 && (
        <section className="pt-2">
          <h2 className="px-4 pb-3 text-sm font-bold">Recent posts</h2>
          <div className="grid grid-cols-2 gap-3 px-4">
            {posts.map((p: any) => {
              const img = firstImage(p) as string;
              const text = (p.caption ?? p.body ?? "").trim();
              const name =
                p.profiles?.display_name ?? p.profiles?.username ?? "Someone";
              return (
                <Link key={p.id} href={`/p/${p.id}`} className="group block">
                  <div className="relative aspect-square overflow-hidden rounded-2xl bg-elevated">
                    <Image
                      src={img}
                      alt={text || `Post by ${name}`}
                      fill
                      sizes="(max-width: 480px) 50vw, 240px"
                      className="object-cover"
                    />
                  </div>
                  {/* The words matter more than the picture here. A stranger
                      is deciding what this place is, and a wall of untitled
                      photographs does not answer that. */}
                  {text && (
                    <p className="mt-1.5 line-clamp-2 text-xs leading-snug text-muted">
                      {text}
                    </p>
                  )}
                  <p className="mt-0.5 text-[11px] font-semibold text-faint">
                    {name}
                  </p>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {people.length > 0 && (
        <section className="pt-8">
          <h2 className="px-4 pb-3 text-sm font-bold">People on Hypefy</h2>
          <ul className="flex flex-col">
            {people.map((u: any) => (
              <li key={u.username}>
                <Link
                  href={`/u/${u.username}`}
                  className="flex items-center gap-3 px-4 py-2.5"
                >
                  <Avatar
                    name={u.display_name ?? u.username}
                    hue={u.avatar_hue ?? 280}
                    size={40}
                    src={u.avatar_url ?? undefined}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="truncate text-sm font-semibold">
                        {u.display_name ?? u.username}
                      </span>
                      {u.is_verified && (
                        <VerifiedStar className="h-3.5 w-3.5 shrink-0" />
                      )}
                    </div>
                    <p className="truncate text-xs text-faint">
                      @{u.username}
                      {u.bio ? ` · ${u.bio}` : ""}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="mt-10 flex flex-wrap gap-x-4 gap-y-1 px-4 text-xs text-faint">
        <Link href="/privacy" className="underline">
          Privacy
        </Link>
        <Link href="/terms" className="underline">
          Terms
        </Link>
        <Link href="/guidelines" className="underline">
          Guidelines
        </Link>
      </footer>
    </main>
  );
}
