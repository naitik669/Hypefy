import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { BottomNav } from "@/components/layout/BottomNav";
import { CallProvider } from "@/components/calls/CallProvider";
import { UploadProvider } from "@/components/upload/UploadProvider";

/**
 * Shell for the signed-in app: a mobile-first centered column with a
 * persistent bottom nav. Also gates the whole app behind a completed
 * profile — incomplete users are sent to /setup-profile.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = await getProfile(supabase);
  if (!profile?.profileCompleted) {
    redirect("/setup-profile");
  }

  return (
    <CallProvider userId={user!.id}>
      <UploadProvider>
        <div className="relative mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-background">
          <div className="flex-1 pb-[84px]">{children}</div>
          <BottomNav
            avatarUrl={profile.avatarUrl}
            avatarHue={profile.avatarHue ?? 200}
            displayName={profile.displayName ?? "U"}
          />
        </div>
      </UploadProvider>
    </CallProvider>
  );
}
