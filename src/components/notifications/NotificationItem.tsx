"use client";

import { useState } from "react";
import { Star, MessageCircle, UserPlus, Users, Flame } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { VerifiedStar } from "@/components/ui/VerifiedStar";
import type { Notif, NotifType } from "@/lib/mock-notifications";

const iconFor: Record<NotifType, React.ComponentType<{ size?: number; className?: string }>> = {
  hype: Star,
  shot_hype: Star,
  comment: MessageCircle,
  follow: UserPlus,
  room_invite: Users,
  room_join: Users,
  room_active: Flame,
};

export function NotificationItem({ notif }: { notif: Notif }) {
  const [done, setDone] = useState(false);
  const Icon = iconFor[notif.type];

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 ${
        notif.unread ? "bg-accent/[0.04]" : ""
      }`}
    >
      <div className="relative shrink-0">
        <Avatar name={notif.actor.name} hue={notif.actor.hue} size={44} />
        <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-elevated ring-2 ring-background">
          <Icon size={11} className="text-accent" />
        </span>
      </div>

      <p className="min-w-0 flex-1 text-sm leading-snug">
        <span className="inline-flex items-center gap-1 font-semibold">
          {notif.actor.name}
          {notif.actor.verified && (
            <VerifiedStar className="h-4.5 w-4.5 text-verified" />
          )}
        </span>{" "}
        <span className="text-muted">{notif.text}</span>{" "}
        <span className="text-faint">· {notif.time}</span>
      </p>

      {notif.preview && (
        <div
          className="h-11 w-11 shrink-0 rounded-lg"
          style={{
            background: `radial-gradient(120% 90% at 20% 10%, hsl(${notif.preview.from} 80% 55%), hsl(${notif.preview.to} 70% 25%))`,
          }}
        />
      )}

      {notif.action && (
        <button
          type="button"
          onClick={() => setDone((v) => !v)}
          className={`shrink-0 rounded-pill px-3.5 py-1.5 text-xs font-bold transition-colors ${
            done
              ? "border border-border text-foreground"
              : "bg-accent text-accent-ink"
          }`}
        >
          {notif.action === "follow"
            ? done
              ? "Following"
              : "Follow"
            : done
              ? "Joined"
              : "Join"}
        </button>
      )}

      {notif.unread && !notif.action && (
        <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />
      )}
    </div>
  );
}
