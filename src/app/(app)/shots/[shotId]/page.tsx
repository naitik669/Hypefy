import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { ReelsFeed } from "@/components/shots/ReelsFeed";

const SELECT =
  "id, user_id, media_url, poster_url, caption, created_at, hype_count, comment_count, profiles(display_name, avatar_hue, username)";

// Shared between generateMetadata and the page render (deduped per request).
const getShot = cache(async (shotId: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("shots").select(SELECT).eq("id", shotId).maybeSingle();
  return data;
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ shotId: string }>;
}): Promise<Metadata> {
  const { shotId } = await params;
  const shot = (await getShot(shotId)) as any;
  if (!shot) return {};
  const prof = Array.isArray(shot.profiles) ? shot.profiles[0] : shot.profiles;
  const username = prof?.username ?? null;
  const title = username ? `@${username}'s Shot on Hypefy` : "Shot on Hypefy";
  const description = (shot.caption as string | null) ?? "Watch this Shot on Hypefy.";
  const image = shot.poster_url as string | null;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "video.other",
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

/**
 * Deep link to a single Shot (reel). Opens the vertical feed starting at
 * the target reel, then continues with the rest (newest first).
 */
export default async function ShotPage({
  params,
}: {
  params: Promise<{ shotId: string }>;
}) {
  const { shotId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const target = await getShot(shotId);
  if (!target) notFound();

  const { data: rest } = await supabase
    .from("shots")
    .select(SELECT)
    .neq("id", shotId)
    .order("created_at", { ascending: false })
    .limit(49);

  const norm = (s: any) => ({
    ...s,
    profiles: Array.isArray(s.profiles) ? s.profiles[0] ?? null : s.profiles,
  });

  const reels = [norm(target), ...(rest ?? []).map(norm)];

  return <ReelsFeed reels={reels} currentUserId={user?.id ?? null} />;
}
