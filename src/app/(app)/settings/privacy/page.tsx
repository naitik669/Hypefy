import { Lock } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export default function PrivacySettingsPage() {
  return (
    <>
      <PageHeader title="Privacy" showBack />
      <EmptyState
        icon={Lock}
        title="Privacy controls coming soon"
        text="Account visibility, who can message you, and blocking will live here."
      />
    </>
  );
}
