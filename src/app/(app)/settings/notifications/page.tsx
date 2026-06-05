import { Bell } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export default function NotificationSettingsPage() {
  return (
    <>
      <PageHeader title="Notifications" showBack />
      <EmptyState
        icon={Bell}
        title="Notification settings coming soon"
        text="You'll be able to choose what pings you — hypes, comments, follows, messages, and calls."
      />
    </>
  );
}
