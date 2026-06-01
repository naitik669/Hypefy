"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import { HypeMeter } from "@/components/ui/HypeMeter";
import { formatCount } from "@/lib/mock";
import type { Room } from "@/lib/mock-discover";

export function RoomCard({ room }: { room: Room }) {
  const [joined, setJoined] = useState(false);

  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface">
      <div
        className="h-20 w-full"
        style={{
          background: `linear-gradient(120deg, hsl(${room.from} 75% 50%), hsl(${room.to} 70% 32%))`,
        }}
      />
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{room.name}</p>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
              <Users size={11} />
              {formatCount(room.members)} members
            </p>
          </div>
          <button
            type="button"
            onClick={() => setJoined((v) => !v)}
            className={`shrink-0 rounded-pill px-3.5 py-1.5 text-xs font-bold transition-colors ${
              joined
                ? "border border-border text-foreground"
                : "bg-accent text-accent-ink"
            }`}
          >
            {joined ? "Joined" : "Join"}
          </button>
        </div>
        <div className="mt-3">
          <HypeMeter value={room.hype} />
        </div>
      </div>
    </div>
  );
}
