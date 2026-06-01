"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { notifications, type NotifGroup, type NotifType } from "@/lib/mock-notifications";

const groups: NotifGroup[] = ["Now", "Earlier", "This week"];

type Filter = "All" | "Hypes" | "Comments" | "Follows" | "Communities";

const filterMap: Record<Filter, NotifType[]> = {
  All: [],
  Hypes: ["hype", "shot_hype"],
  Comments: ["comment"],
  Follows: ["follow"],
  Communities: ["room_invite", "room_join", "room_active"],
};

const filters: Filter[] = ["All", "Hypes", "Comments", "Follows", "Communities"];

export default function NotificationsPage() {
  const [active, setActive] = useState<Filter>("All");

  const allowed = filterMap[active];
  const filtered =
    allowed.length === 0
      ? notifications
      : notifications.filter((n) => allowed.includes(n.type));

  return (
    <>
      <PageHeader title="Notifications" showBack />

      {/* Filter pills */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-3 pt-3">
        {filters.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setActive(f)}
            className={`shrink-0 rounded-pill px-4 py-1.5 text-sm font-semibold transition-colors ${
              f === active
                ? "bg-accent text-accent-ink"
                : "bg-surface text-muted hover:text-foreground"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="Nothing here"
          text="No notifications matching this filter yet."
        />
      ) : (
        groups.map((group) => {
          const items = filtered.filter((n) => n.group === group);
          if (items.length === 0) return null;
          return (
            <section key={group}>
              <h2 className="px-4 pb-1 pt-4 text-sm font-bold text-muted">
                {group}
              </h2>
              {items.map((n) => (
                <NotificationItem key={n.id} notif={n} />
              ))}
            </section>
          );
        })
      )}
    </>
  );
}
