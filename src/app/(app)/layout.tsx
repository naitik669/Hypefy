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
import { AppLockGate } from "@/components/settings/AppLockGate";

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

  // Initial unread DM count for the BottomNav badge — one aggregate, computed
  // in the database.
  //
  // This used to fetch conversation_members with no limit, then EVERY message
  // across all of those conversations with no limit, and reduce them in JS —
  // in the shared signed-in layout, so on every server render of every page,
  // to produce one integer.
  //
  // The cost was the smaller half of the problem. The sort was globally
  // descending across all conversations, so once the row cap was reached one
  // chatty thread filled the entire window and every other conversation's
  // latest message was truncated away. The badge did not just get slow: it
  // silently under-counted, and got worse the more the app was used.
  //
  // unread_dm_count() (0046) keeps the exact rule the JS applied — look only
  // at the LATEST message per conversation, skip muted, skip conversations
  // where you spoke last — verified to return the same number for every
  // existing user before it replaced this.
  const { data: unreadCount } = await supabase.rpc("unread_dm_count");
  const initialUnreadMsgs = (unreadCount as number | null) ?? 0;

  return (
    <ToastProvider>
      <CallProvider userId={user!.id}>
        <GroupCallProvider userId={user!.id}>
          <UploadProvider>
            <NativeShell />
            <AppLockGate />
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
