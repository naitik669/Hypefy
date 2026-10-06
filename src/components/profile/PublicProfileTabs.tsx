"use client";

import { useState } from "react";
import { Grid3x3, Zap, Repeat2 } from "lucide-react";
import Link from "next/link";
import { EmptyScene, ctaClass } from "@/components/empty/EmptyScene";
import {
  CanvasArt,
  ClapperArt,
  ConeArt,
  CurtainsArt,
  FrameArt,
} from "@/components/empty/scenes";
import { RehypesGrid } from "@/components/profile/RehypesGrid";
import { FollowButton } from "@/components/profile/FollowButton";
import { PostsGrid, ShotsGrid } from "@/components/profile/ProfileGrids";

type Tab = "Posts" | "Shots" | "Rehypes";

/** Someone else's empty profile gets one of three scenes, always the same one
 *  for the same person, so it reads as theirs rather than random. */
const OTHER_EMPTY = [
  { art: <CanvasArt />, title: "Blank canvas" },
  { art: <CurtainsArt />, title: "Curtains closed" },
  { art: <ConeArt />, title: "Still setting up" },
];

function sceneFor(userId: string) {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) | 0;
  return OTHER_EMPTY[Math.abs(h) % OTHER_EMPTY.length];
}

export function PublicProfileTabs({
  userId,
  isOwn,
  currentUserId,
  name = "They",
  initialFollowing = false,
  initialRequested = false,
}: {
  userId: string;
  isOwn: boolean;
  currentUserId: string | null;
  name?: string;
  initialFollowing?: boolean;
  initialRequested?: boolean;
}) {
  // Rehypes are public, like a reshare anywhere else; the database still
  // hides a private account's from people who do not follow it.
  const tabs: Tab[] = ["Posts", "Shots", "Rehypes"];
  const [tab, setTab] = useState<Tab>("Posts");

  return (
    <div className="mt-2">
      {/* Tab bar — thin hairline dividers, blends with the page background */}
      <div className="sticky top-14 z-10 flex border-y border-border chrome-bar">
        {tabs.map((t) => {
          const Icon = t === "Posts" ? Grid3x3 : t === "Shots" ? Zap : Repeat2;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 py-3 text-sm font-semibold transition-colors ${
                tab === t
                  ? "border-accent text-foreground"
                  : "border-transparent text-muted"
              }`}
            >
              <Icon size={16} /> {t}
            </button>
          );
        })}
      </div>

      {/* The grids load more as you scroll and can be held to look closer; see ProfileGrids. */}
      <div key={tab} className="animate-fade-swap mt-3">
        {tab === "Rehypes" ? (
          <RehypesGrid userId={userId} isOwn={isOwn} name={name} viewerId={currentUserId} />
        ) : tab === "Posts" ? (
          <PostsGrid
            key={userId}
            userId={userId}
            viewerId={currentUserId}
            empty={
              isOwn ? (
                <EmptyScene
                  art={<FrameArt />}
                  title="Blank wall"
                  text="Hang your first post."
                  cta={
                    <Link href="/create/post" className={ctaClass}>
                      Create a post
                    </Link>
                  }
                />
              ) : (
                <EmptyScene
                  art={sceneFor(userId).art}
                  title={sceneFor(userId).title}
                  text={`${name} hasn't posted yet.`}
                  // Following is the one useful thing to do here; once you
                  // already do, there's nothing to ask.
                  cta={
                    currentUserId && !initialFollowing ? (
                      <FollowButton
                        targetUserId={userId}
                        initialFollowing={initialFollowing}
                        initialRequested={initialRequested}
                        variant="cta"
                        followLabel={`Follow ${name}`}
                      />
                    ) : undefined
                  }
                />
              )
            }
          />
        ) : (
          <ShotsGrid
            key={userId}
            userId={userId}
            viewerId={currentUserId}
            empty={
              <EmptyScene
                art={<ClapperArt />}
                title="No Shots fired"
                text={isOwn ? "Lights, camera, you." : `${name} hasn't posted a Shot yet.`}
                timing={{ head: 1.2, sub: 1.55, cta: 1.9 }}
                cta={
                  isOwn ? (
                    <Link href="/create?mode=shot" className={ctaClass}>
                      Record a Shot
                    </Link>
                  ) : undefined
                }
              />
            }
          />
        )}
      </div>
    </div>
  );
}
