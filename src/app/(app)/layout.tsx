import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { BottomNav } from "@/components/layout/BottomNav";
import { CallProvider } from "@/components/calls/CallProvider";
import { GroupCallProvider } from "@/components/calls/GroupCallProvider";
import { UploadProvider } from "@/components/upload/UploadProvider";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { NativeShell } from "@/components/native/NativeShell";
import { SwipeNav } from "@/components/layout/SwipeNav";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { PresenceHeartbeat } from "@/components/presence/PresenceHeartbeat";
import { InAppNotifier } from "@/components/messages/InAppNotifier";

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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Anonymous visitors can land here on PUBLIC pages (/p, /u, /shots/[id]
  // via shared links — the middleware already guards the private routes).
  // Render a bare shell for them; only signed-in users get the full app
  // chrome, and only signed-in-but-incomplete users go to /setup-profile.
  if (!user) {
    return (
      <div className="relative mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-background">
        <div className="flex-1">{children}</div>
      </div>
    );
  }

  const profile = await getProfile(supabase);
  if (!profile?.profileCompleted) {
    redirect("/setup-profile");
  }

  // Initial unread DM count for BottomNav badge. Avoid querying `conversations`
  // directly (RLS behaves differently in layout vs page context); use
  // conversation_members + messages only — both are member-gated by RLS.
  const { data: myMembers } = await supabase
    .from("conversation_members")
    .select("conversation_id, last_read_at, muted_at")
    .eq("user_id", user!.id)
    .is("blocked_at", null);

  let initialUnreadMsgs = 0;
  if (myMembers?.length) {
    const convIds = myMembers.map((m: any) => m.conversation_id as string);
    const { data: latestMsgs } = await supabase
      .from("messages")
      .select("conversation_id, sender_id, created_at")
      .in("conversation_id", convIds)
      .order("created_at", { ascending: false });

    // Map: conversation_id → {sender_id, created_at} of the LATEST message
    const latestByConv = new Map<
      string,
      { sender_id: string; created_at: string }
    >();
    for (const m of latestMsgs ?? []) {
      const msg = m as {
        conversation_id: string;
        sender_id: string;
        created_at: string;
      };
      if (!latestByConv.has(msg.conversation_id))
        latestByConv.set(msg.conversation_id, msg);
    }

    initialUnreadMsgs = (myMembers ?? []).filter((mem: any) => {
      if (mem.muted_at) return false;
      const latest = latestByConv.get(mem.conversation_id);
      if (!latest) return false;
      if (latest.sender_id === user!.id) return false;
      if (!mem.last_read_at) return true;
      return new Date(latest.created_at) > new Date(mem.last_read_at);
    }).length;
  }

  return (
    <ToastProvider>
      <CallProvider userId={user!.id}>
        <GroupCallProvider userId={user!.id}>
          <UploadProvider>
            <NativeShell />
            <PresenceHeartbeat />
            <InAppNotifier currentUserId={user!.id} />
            <InstallPrompt />
            <div className="relative mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-background">
              {/* Wraps only the scrolling content, never the nav — the bar
                  has to stay put while the page slides under the finger. */}
              <div className="flex-1 pb-[84px]">
                <SwipeNav>{children}</SwipeNav>
              </div>
              <BottomNav
                avatarUrl={profile.avatarUrl}
                avatarHue={profile.avatarHue ?? 200}
                displayName={profile.displayName ?? "U"}
                currentUserId={user!.id}
                initialUnreadMsgs={initialUnreadMsgs}
              />
            </div>
          </UploadProvider>
        </GroupCallProvider>
      </CallProvider>
    </ToastProvider>
  );
}
