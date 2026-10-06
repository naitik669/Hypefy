"use client";

import { useState } from "react";
import { Grid3x3, Zap, Repeat2 } from "lucide-react";
import Link from "next/link";
import { EmptyScene, SceneLine, ctaClass } from "@/components/empty/EmptyScene";
import { ClapperArt, FrameArt } from "@/components/empty/scenes";
import { RehypesGrid } from "@/components/profile/RehypesGrid";
import { PostsGrid, ShotsGrid } from "@/components/profile/ProfileGrids";

/** Saved is not a tab: it has its own page, behind the bookmark at the top of
 *  the profile, which paginates where the tab stopped at 30. */
type Tab = "Posts" | "Shots" | "Rehypes";

const tabs: { key: Tab; Icon: typeof Grid3x3 }[] = [
  { key: "Posts", Icon: Grid3x3 },
  { key: "Shots", Icon: Zap },
  { key: "Rehypes", Icon: Repeat2 },
];

export function ProfileTabs({ userId }: { userId: string }) {
  const [tab, setTab] = useState<Tab>("Posts");

  return (
    <div className="mt-2">
      {/* Tab bar — thin hairline dividers, blends with the page background */}
      <div className="sticky top-14 z-10 flex border-y border-border chrome-bar">
        {tabs.map(({ key, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 py-3 text-sm font-semibold transition-colors ${
              tab === key
                ? "border-accent text-foreground"
                : "border-transparent text-muted"
            }`}
          >
            <Icon size={16} />
            {key}
          </button>
        ))}
      </div>

      {/* The grids load more as you scroll and can be held to look closer; see ProfileGrids. */}
      <div key={tab} className="animate-fade-swap mt-3">
        {tab === "Posts" && (
          <PostsGrid
            userId={userId}
            viewerId={userId}
            fromProfile
            empty={
              <EmptyScene
                art={<FrameArt />}
                title="Blank wall"
                text="Hang your first post."
                cta={
                  <Link href="/create/post" className={ctaClass}>
                    Create a post
                  </Link>
                }
              >
                <SceneLine at={2.05} className="mt-0.5 text-[12.5px] text-muted">
                  For inspiration,{" "}
                  <Link href="/discover" className="font-extrabold text-foreground underline decoration-2 underline-offset-[3px]">
                    explore
                  </Link>{" "}
                  more.
                </SceneLine>
              </EmptyScene>
            }
          />
        )}

        {tab === "Shots" && (
          <ShotsGrid
            userId={userId}
            viewerId={userId}
            empty={
              <EmptyScene
                art={<ClapperArt />}
                title="No Shots fired"
                text="Lights, camera, you."
                // The words wait for the board to settle level.
                timing={{ head: 1.2, sub: 1.55, cta: 1.9 }}
                cta={
                  <Link href="/create?mode=shot" className={ctaClass}>
                    Record a Shot
                  </Link>
                }
              />
            }
          />
        )}

        {/* Rehypes — what they passed on, posts and Shots together */}
        {tab === "Rehypes" && <RehypesGrid userId={userId} isOwn viewerId={userId} />}
      </div>
    </div>
  );
}
