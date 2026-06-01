"use client";

import { useState } from "react";
import { Grid3x3, Zap, Users } from "lucide-react";
import { posts, shows } from "@/lib/mock";
import { rooms } from "@/lib/mock-discover";
import { RoomCard } from "@/components/discover/RoomCard";
import { EmptyState } from "@/components/ui/EmptyState";

const tabs = [
  { key: "Posts", Icon: Grid3x3 },
  { key: "Shots", Icon: Zap },
  { key: "Rooms", Icon: Users },
] as const;

type TabKey = (typeof tabs)[number]["key"];

export function ProfileTabs() {
  const [tab, setTab] = useState<TabKey>("Posts");

  return (
    <div className="mt-2">
      <div className="sticky top-14 z-10 flex border-y border-border bg-background/90 backdrop-blur-xl">
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

      {tab === "Posts" && (
        <div className="grid grid-cols-3 gap-0.5">
          {posts.map((p) => (
            <div
              key={p.id}
              className="aspect-square"
              style={{
                background: `radial-gradient(120% 90% at 25% 15%, hsl(${p.mediaFrom} 80% 55%), hsl(${p.mediaTo} 70% 22%))`,
              }}
            />
          ))}
          {posts.slice(0, 2).map((p) => (
            <div
              key={`${p.id}-b`}
              className="aspect-square"
              style={{
                background: `radial-gradient(120% 90% at 75% 25%, hsl(${p.mediaTo} 80% 50%), hsl(${p.mediaFrom} 70% 20%))`,
              }}
            />
          ))}
        </div>
      )}

      {tab === "Shots" && (
        <div className="grid grid-cols-3 gap-0.5">
          {shows.map((s) => (
            <div
              key={s.id}
              className="aspect-[3/4]"
              style={{
                background: `linear-gradient(150deg, hsl(${s.hue} 75% 52%), hsl(${(s.hue + 50) % 360} 70% 28%))`,
              }}
            />
          ))}
        </div>
      )}

      {tab === "Rooms" &&
        (rooms.length > 0 ? (
          <div className="flex flex-col gap-3 p-4">
            {rooms.slice(0, 3).map((r) => (
              <RoomCard key={r.id} room={r} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No rooms yet"
            text="Rooms you create or join will show up here."
          />
        ))}
    </div>
  );
}
