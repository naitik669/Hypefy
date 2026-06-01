import { Settings, Bell } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { notifications, type NotifGroup } from "@/lib/mock-notifications";

const groups: NotifGroup[] = ["Now", "Earlier", "This week"];

export default function NotificationsPage() {
  return (
    <>
      <PageHeader
        title="Notifications"
        showBack
        right={
          <button
            type="button"
            aria-label="Notification settings"
            className="flex h-10 w-10 items-center justify-center rounded-full text-foreground hover:bg-white/5"
          >
            <Settings size={20} />
          </button>
        }
      />

      {notifications.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notifications yet"
          text="Hypes, replies, room invites, and updates will appear here."
        />
      ) : (
        groups.map((group) => {
          const items = notifications.filter((n) => n.group === group);
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
