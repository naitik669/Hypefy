import { cache } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { JoinBanner } from "@/components/growth/JoinBanner";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { PublicProfileTabs } from "@/components/profile/PublicProfileTabs";
import { ShowcaseRail } from "@/components/showcase/ShowcaseRail";
import { StreakBadges } from "@/components/profile/StreakBadges";
import { FollowButton } from "@/components/profile/FollowButton";
import { MessageButton } from "@/components/profile/MessageButton";
import { HyperFavoriteButton } from "@/components/profile/HyperFavoriteButton";
import { SignOutButton } from "@/components/SignOutButton";
import { hueFromId } from "@/lib/profile";
import { Lock } from "lucide-react";

async function fetchStats(supabase: any, userId: string) {
  const [postsRes, shotsRes, followersRes, followingRes] = await Promise.all([
    supabase.from("posts").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("shots").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("follows").select("id", { count: "exact", head: true }).eq("following_id", userId),
    supabase.from("follows").select("id", { count: "exact", head: true }).eq("follower_id", userId),
  ]);
  // "Posts" includes Shots.
  return { posts: (postsRes.count ?? 0) + (shotsRes.count ?? 0), followers: followersRes.count ?? 0, following: followingRes.count ?? 0 };
}

// Shared between generateMetadata and the page render (deduped per request).
const getProfileByUsername = cache(async (username: string) => {
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", username.toLowerCase())
    .eq("profile_completed", true)
    .maybeSingle();
  return profile;
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const profile = await getProfileByUsername(username);
  if (!profile) return {};
  const name = profile.display_name ?? profile.username ?? "User";
  const title = `${name} (@${profile.username})`;
  const description = profile.bio ?? `Follow ${name} on Hypefy, where your personality lives.`;
  const image = (profile as any).avatar_url as string | null;
  return {
    title,
    description,
    openGraph: {
      title: `${title} · Hypefy`,
      description,
      type: "profile",
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: "summary",
      title: `${title} · Hypefy`,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const supabase = await createClient();
  const { data: { user: currentUser } } = await supabase.auth.getUser();

  const profile = await getProfileByUsername(username);
  if (!profile) notFound();

  const isOwn = currentUser?.id === profile.id;
  const stats = await fetchStats(supabase, profile.id);

  let isFollowing = false;
  let isRequested = false;
  let isHyper = false;
  let isMutualHyper = false;
  let isFavourite = false;
  if (currentUser && !isOwn) {
    const [{ data: followRow }, { data: hyperRow }, { data: reverseHyperRow }, { data: favRow }, { data: reqRow }] = await Promise.all([
      supabase.from("follows").select("id").eq("follower_id", currentUser.id).eq("following_id", profile.id).maybeSingle(),
      supabase.from("close_friends").select("user_id").eq("user_id", currentUser.id).eq("friend_id", profile.id).maybeSingle(),
      supabase.from("close_friends").select("user_id").eq("user_id", profile.id).eq("friend_id", currentUser.id).maybeSingle(),
      supabase.from("favorites").select("user_id").eq("user_id", currentUser.id).eq("friend_id", profile.id).maybeSingle(),
      supabase.from("follow_requests").select("target_id").eq("requester_id", currentUser.id).eq("target_id", profile.id).maybeSingle(),
    ]);
    isFollowing = !!followRow;
    isRequested = !!reqRow;
    isHyper = !!hyperRow;
    isMutualHyper = !!hyperRow && !!reverseHyperRow;
    isFavourite = !!favRow;
  }

  // Private account: only the owner and followers see content
  const isLocked = !!profile.is_private && !isOwn && !isFollowing;

  // The 24h status thought-bubble. Own note is read directly; others go through
  // get_notes_for (block + audience + private-account gated). Hidden when locked.
  let note: { text: string; audience: "mutual" | "close"; track: unknown; createdAt: string } | null = null;
  if (!isLocked) {
    if (isOwn) {
      const { data: myNote } = await supabase
        .from("notes")
        .select("text, audience, track, created_at")
        .eq("user_id", profile.id)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (myNote) note = { text: (myNote as any).text, audience: (myNote as any).audience, track: (myNote as any).track, createdAt: (myNote as any).created_at };
    } else if (currentUser) {
      const { data: notes } = await supabase.rpc("get_notes_for", { p_user_ids: [profile.id] });
      const row = (notes ?? [])[0] as any;
      if (row) note = { text: row.text, audience: row.audience, track: row.track, createdAt: row.created_at };
    }
  }

  const name = profile.display_name ?? profile.username ?? "User";
  const hue = profile.avatar_hue ?? hueFromId(profile.id);
  const bannerId = profile.banner_id ?? "lime-pulse";
  const tags: string[] = profile.profile_tags ?? [];

  // Active Shows for the avatar ring
  const nowIso = new Date().toISOString();
  const { data: activeShows } = await supabase
    .from("shows")
    .select("id")
    .eq("user_id", profile.id)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: true })
    .limit(1);
  // Entry Show (oldest) for the avatar ring — never expose to non-followers of private accounts
  const entryShowId = (!isLocked && activeShows?.[0]?.id) || null;

  return (
    <>
      <ProfileHeader
        name={name}
        username={profile.username}
        bio={profile.bio}
        tags={tags}
        hue={hue}
        avatarUrl={profile.avatar_url}
        bannerId={bannerId}
        bannerUrl={profile.banner_url}
        accentId={(profile as { accent_id?: string | null }).accent_id}
        hasActiveShow={!!entryShowId}
        entryShowId={entryShowId}
        userId={profile.id}
        currentUserId={currentUser?.id ?? null}
        stats={stats}
        verified={!!(profile as any).is_verified}
        isHyper={isHyper}
        isMutualHyper={isMutualHyper}
        anthemEditable={isOwn}
        anthem={(profile as any).anthem ?? null}
        note={note}
        noteEditable={isOwn}
        actions={
          isOwn ? (
            <>
              <Link href="/settings/profile" className="flex h-10 flex-1 items-center justify-center rounded-xl border border-border bg-elevated text-sm font-semibold transition-colors hover:bg-elevated/70">
                Edit profile
              </Link>
              <SignOutButton />
            </>
          ) : currentUser ? (
            <>
              <FollowButton
                currentUserId={currentUser.id}
                targetUserId={profile.id}
                targetUsername={profile.username}
                initialFollowing={isFollowing}
                initialRequested={isRequested}
              />
              <MessageButton currentUserId={currentUser.id} targetUserId={profile.id} />
              <HyperFavoriteButton
                currentUserId={currentUser.id}
                targetUserId={profile.id}
                targetUsername={profile.username}
                initialHyper={isHyper}
                initialFavourite={isFavourite}
              />
            </>
          ) : (
            <Link href="/signin" className="flex h-10 flex-1 items-center justify-center rounded-xl bg-accent text-sm font-bold text-accent-ink">
              Sign in to follow
            </Link>
          )
        }
      />

      {/* Streak + milestones (hidden for locked private accounts) */}
      {!isLocked && (
        <div className="px-4">
          <StreakBadges userId={profile.id} />
        </div>
      )}

      {/* Pinned highlights (hidden for locked private accounts) */}
      {!isLocked && (
        <ShowcaseRail userId={profile.id} isOwn={isOwn} />
      )}

      {/* Tabs: Posts | Shots (no Saved for others) — locked for private accounts */}
      {isLocked ? (
        <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface">
            <Lock size={24} className="text-muted" />
          </span>
          <p className="text-sm font-bold">This account is private</p>
          <p className="text-xs text-muted">Follow {name} to see their posts and Shots.</p>
        </div>
      ) : (
        <PublicProfileTabs
          userId={profile.id}
          isOwn={isOwn}
          currentUserId={currentUser?.id ?? null}
        />
      )}

      {!currentUser && <JoinBanner />}
    </>
  );
}
