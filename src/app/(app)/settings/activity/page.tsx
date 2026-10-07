import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageCircle, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ShotResultsGrid } from "@/components/search/ShotResultsGrid";
import { PostTileGrid } from "@/components/feed/PostTileGrid";
import { timeAgoShort } from "@/lib/time";
import { loadYourActivity } from "@/lib/your-activity";

export const metadata = { title: "Your activity" };
export const dynamic = "force-dynamic";

/**
 * Your activity: what you hyped and what you said, newest first.
 *
 * Each thing opens where it lives, which is also where it is undone: a hype
 * is taken back on the post, a comment deleted from under it.
 */

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 px-4 text-xs font-bold uppercase tracking-widest text-faint">{children}</h2>;
}

export default async function YourActivityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { hypedShots, hypedPosts, comments } = await loadYourActivity(supabase, user.id);
  const nothing = hypedShots.length === 0 && hypedPosts.length === 0 && comments.length === 0;

  return (
    <>
      <PageHeader title="Your activity" showBack />

      <div className="flex flex-col gap-7 pb-24 pt-4">
        <p className="px-4 text-[13px] leading-relaxed text-muted">
          What you&rsquo;ve hyped and said lately. Only you can see this page.
        </p>

        {nothing && (
          <EmptyState
            icon={Star}
            title="Nothing yet"
            text="Hype a post or leave a comment and it shows up here, so you can find it again."
            ctaLabel="Go to Home"
            ctaHref="/home"
            variant="compact"
          />
        )}

        {hypedShots.length > 0 && (
          <section>
            <Heading>Shots you hyped</Heading>
            <ShotResultsGrid shots={hypedShots} />
          </section>
        )}

        {hypedPosts.length > 0 && (
          <section>
            <Heading>Posts you hyped</Heading>
            <PostTileGrid posts={hypedPosts} />
          </section>
        )}

        {comments.length > 0 && (
          <section>
            <Heading>Your comments</Heading>
            <ul className="flex flex-col divide-y divide-border/50" data-your-comments>
              {comments.map((c) => (
                <li key={c.id}>
                  <Link href={c.href} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-white/5">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-muted">
                      <MessageCircle size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-sm leading-snug">{c.body}</span>
                      <span className="mt-0.5 block text-xs text-faint">
                        On a {c.on} · {timeAgoShort(c.at)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
