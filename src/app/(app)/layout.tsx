import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { after } from "next/server";
import { readSessionId, deviceLabel } from "@/lib/login-alert";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { SideNav } from "@/components/layout/SideNav";
import { BottomNav } from "@/components/layout/BottomNav";
import { CallProvider } from "@/components/calls/CallProvider";
import { GroupCallProvider } from "@/components/calls/GroupCallProvider";
import { UploadProvider } from "@/components/upload/UploadProvider";
import { UploadStatus } from "@/components/upload/UploadStatus";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { FrameCatalogProvider } from "@/components/ui/FrameCatalogProvider";
import { loadFrames } from "@/lib/frames-load";
import { currentUser } from "@/lib/auth-user";
import { ConnectionNotice } from "@/components/native/ConnectionNotice";
import { ReturnToDestination } from "@/components/native/ReturnToDestination";
import { NativeShell } from "@/components/native/NativeShell";
import { SwipeNav } from "@/components/layout/SwipeNav";
import { TabScrollTop } from "@/components/layout/TabScrollTop";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { PresenceHeartbeat } from "@/components/presence/PresenceHeartbeat";
import { InAppNotifier } from "@/components/messages/InAppNotifier";
import { MessageStreamProvider } from "@/components/messages/MessageStream";
import { VaultAutoLock } from "@/components/vault/VaultAutoLock";
import { toVaultOverview } from "@/lib/chat-vault";
import { EncryptionSetup } from "@/components/e2ee/EncryptionSetup";
import { AppLockGate } from "@/components/settings/AppLockGate";
import { SuspendedScreen } from "@/components/moderation/SuspendedScreen";

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
  const user = await currentUser();

  // Anonymous visitors can land here on PUBLIC pages (/p, /u, /shots/[id]
  // via shared links — the middleware already guards the private routes).
  // Render a bare shell for them; only signed-in users get the full app
  // chrome, and only signed-in-but-incomplete users go to /setup-profile.
  if (!user) {
    return (
      <FrameCatalogProvider frames={await loadFrames()}>
        {/* The same three widths as the signed-in column. Anonymous visitors
            arrive here on shared links — a post, a profile, a Shot — which is
            exactly the traffic most likely to be on a desktop, and it was
            getting the phone column. No rail: there is nothing to navigate
            to without an account. */}
        <div className="relative mx-auto flex min-h-dvh w-full app-column flex-col bg-background">
          <TabScrollTop />
          <div className="flex-1">{children}</div>
        </div>
      </FrameCatalogProvider>
    );
  }

  // Asked together, not one after the other. The badge's count doesn't
  // depend on the profile, and waiting for the profile first put a second
  // database round trip in front of the first byte of every page — most
  // visibly on a cold app launch, where it is the whole shell that waits.
  const [profile, { data: unreadCount }, { data: vaultRows }, frames] = await Promise.all([
    getProfile(supabase, user),
    supabase.rpc("unread_dm_count"),
    // Counts and one yes/no; never who. For the dot on the Messages tab.
    supabase.rpc("vault_overview"),
    // In here rather than awaited in the JSX below, where it was a round
    // trip of its own after all of these had already finished.
    loadFrames(),
  ]);

  // No date of birth on file means we never actually asked — the Google button
  // on the sign-in page ran no age check at all, and the signup path could lose
  // the answer across the OAuth redirect. Ask before anything else, including
  // profile setup, so an under-13 account never gets as far as having a
  // username. 15 of the 17 accounts that predate migration 0053 land here.
  if (!profile?.dateOfBirth) {
    redirect("/age-check");
  }

  if (!profile?.profileCompleted) {
    redirect("/setup-profile");
  }

  // Suspension. The database triggers (0057) are what actually stop a suspended
  // account writing anything; this is the screen that says why, because
  // otherwise every action fails with an error and nothing explains it.
  //
  // suspended_until in the past means it has elapsed — the triggers already
  // treat it that way, and this has to agree or the two would disagree about
  // who is suspended.
  // The admin desk is a tool, not a feed: it gets the whole window.
  const pathname = (await headers()).get("x-pathname") ?? "";
  /*
   * How wide the content column gets, by shape.
   *
   * This was one of two values — 1400px for /admin, 480px for everything
   * else — and the 480 was the whole app: thirty-five call sites and a
   * hard-coded 480 inside SwipeNav's own arithmetic. A desktop browser was
   * getting the phone build rendered in a 480px slot on a 1440px screen,
   * which is not a degraded experience so much as an unhandled one.
   *
   * Three widths now, matching @hypefy/tokens' `columns`: the phone figure
   * unchanged so nothing about that layout moves, then wider at tablet, then
   * wider again beside the rail at desktop. Not the full window at desktop —
   * a line of feed text 1400px long is unreadable, which is why every social
   * feed on a wide screen is a column with space either side.
   *
   * The admin desk keeps the whole window: it is a tool with tables, not a
   * feed, and it is the one route that was already allowed to say so.
   */
  const column = pathname.startsWith("/admin")
    ? "max-w-[1400px]"
    : "app-column";

  const suspendedNow =
    !!profile.suspendedAt &&
    (!profile.suspendedUntil || new Date(profile.suspendedUntil) > new Date());

  if (suspendedNow) {
    // The routes a suspended person must keep: how to appeal, what the rules
    // are, and how to export or delete their account.
    const allowed = ["/help", "/settings/account", "/guidelines"];
    if (!allowed.some((p) => pathname.startsWith(p))) {
      return (
        <SuspendedScreen
          reason={profile.suspensionReason}
          until={profile.suspendedUntil}
        />
      );
    }
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
  const initialUnreadMsgs = (unreadCount as number | null) ?? 0;

  // First sighting of this session id raises a "new sign-in" alert; every
  // render after that is a no-op on an indexed primary key.
  //
  // Deliberately NOT a trigger on auth.sessions, which is the obvious place
  // and the wrong one: it would run inside GoTrue's own transaction, so a
  // fault in it — including the webhook that fires on every notification
  // insert — would break signing in, for everybody. The cost of doing it here
  // is that a session which authenticates and never loads a page raises no
  // alert, which is the moment it also cannot do anything.
  // Written after the response, not before it: nobody is waiting to read it,
  // and on a cold launch it was a database write standing between the reader
  // and the first thing they see. after() still runs on a redirect, so a
  // session that only ever lands on /setup-profile is recorded the same.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const sessionId = readSessionId(session?.access_token);
  const userAgent = (await headers()).get("user-agent");
  if (sessionId) {
    after(async () => {
      await supabase.rpc("record_login_session", {
        p_session_id: sessionId,
        p_label: deviceLabel(userAgent),
      });
    });
  }

  return (
    <FrameCatalogProvider frames={frames}>
    <ToastProvider>
      <CallProvider userId={user!.id}>
        <GroupCallProvider userId={user!.id}>
          <UploadProvider userId={user!.id}>
          {/* One realtime channel for the whole shell. BottomNav, the
              notifier and the inbox each used to open their own, with an
              unfiltered messages subscription in each. */}
          <MessageStreamProvider userId={user!.id}>
            {/* A Shot keeps uploading after you have left the composer, and
                lands you on the Shots feed — which is fixed and full-screen,
                with nowhere to put an inline bar. */}
            <UploadStatus />
            <NativeShell />
            <ConnectionNotice />
            <ReturnToDestination />
            <AppLockGate />
            <PresenceHeartbeat userId={user!.id} />
            <InAppNotifier currentUserId={user!.id} />
            <VaultAutoLock />
            <EncryptionSetup userId={user!.id} />
            <InstallPrompt />
            {/*
              The rail and the column, side by side.

              `lg:justify-center` rather than centring the column on its own:
              the pair is centred as a unit, so the content does not sit
              off-centre by half the rail's width on a wide screen.

              SideNav renders at every size and hides itself below lg. Chosen
              by breakpoint, never by measuring the window — the app is
              server-rendered, and a layout that needs to know the viewport
              width either guesses on the server or flashes the wrong one.
            */}
            <div className="flex min-h-dvh w-full lg:justify-center">
              <SideNav />
              <div className={`relative mx-auto flex min-h-dvh w-full flex-col bg-background lg:mx-0 ${column}`}>
                <TabScrollTop />
                {/* Wraps only the scrolling content, never the nav — the bar
                    has to stay put while the page slides under the finger.
                    --nav-space becomes 0 at lg, where there is no bar. */}
                <div className="flex-1 pb-[var(--nav-space)]">
                  <SwipeNav>{children}</SwipeNav>
                </div>
                <BottomNav
                  avatarUrl={profile.avatarUrl}
                  avatarHue={profile.avatarHue ?? 200}
                  displayName={profile.displayName ?? "U"}
                  currentUserId={user!.id}
                  initialUnreadMsgs={initialUnreadMsgs}
                  lockedUnread={toVaultOverview(vaultRows).unread}
                />
              </div>
            </div>
          </MessageStreamProvider>
          </UploadProvider>
        </GroupCallProvider>
      </CallProvider>
    </ToastProvider>
    </FrameCatalogProvider>
  );
}
