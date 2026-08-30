import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient as createSupabase } from "@supabase/supabase-js";
import webpush from "web-push";
import { sendFcm, fcmConfigured } from "@/lib/fcm";

/**
 * POST /api/push — called by a Supabase pg_net trigger on notifications INSERT.
 * Secured by the x-push-secret header. Sends a web push to every subscription
 * of the notification's recipient; prunes dead (404/410) subscriptions.
 */

// Service-role client (bypasses RLS to read any user's subscriptions)
function adminClient() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

function pushCopy(type: string, actor: string, body: string | null) {
  switch (true) {
    // Locked-chat masking: neither the actor's real name nor the message
    // content ever reaches the notification shade. Body text for real
    // messages is already generic static copy ("sent you a message") set by
    // send_message, not the actual text — but the actor name alone would
    // still reveal *who* you're talking to on a lock screen, which defeats a
    // chat someone locked specifically to hide that contact.
    case type === "locked_dm":
      return { title: "Hypefy", body: "New message" };
    case type.startsWith("hype_"):
      return { title: `⭐ ${actor}`, body: body ?? "hyped your post" };
    case type === "repost":
      return { title: `↻ ${actor}`, body: "reposted your post" };
    case type.startsWith("comment_"):
      return { title: `💬 ${actor}`, body: body ?? "commented on your post" };
    case type === "follow":
      return { title: `${actor} started following you`, body: "Tap to see their profile" };
    case type.startsWith("mention_"):
      return { title: `${actor} mentioned you`, body: body ?? "in a post" };
    default:
      return { title: "Hypefy", body: `${actor}: ${body ?? "new activity"}` };
  }
}

function pushUrl(n: { type: string; target_type: string | null; target_id: string | null }, actorUsername: string | null) {
  if (n.type === "follow") return actorUsername ? `/u/${actorUsername}` : "/notifications";
  if (n.target_type === "post" && n.target_id) return `/p/${n.target_id}`;
  if (n.target_type === "shot" && n.target_id) return `/shots/${n.target_id}`;
  return "/notifications";
}

export async function POST(req: NextRequest) {
  if (req.headers.get("x-push-secret") !== process.env.PUSH_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "push not configured" }, { status: 503 });
  }
  const contactEmail = process.env.PUSH_CONTACT_EMAIL || "mailto:support@hypefy.chat";
  webpush.setVapidDetails(
    contactEmail.startsWith("mailto:") ? contactEmail : `mailto:${contactEmail}`,
    publicKey,
    privateKey,
  );

  const n = await req.json();
  if (!n?.user_id) return NextResponse.json({ error: "bad payload" }, { status: 400 });

  const supabase = adminClient();

  // A DM notification (type new_message / dm_post_shared, target_type
  // conversation) needs one more read to know if the RECIPIENT locked this
  // thread — locked_at is per-member, so it must be checked for n.user_id
  // specifically, not the sender.
  const isDmNotif = n.target_type === "conversation" && (n.type === "new_message" || n.type === "dm_post_shared");

  const [{ data: subs }, { data: devices }, { data: actorProfile }, { data: memberRow }] =
    await Promise.all([
      supabase.from("push_subscriptions").select("endpoint, p256dh, auth").eq("user_id", n.user_id),
      // Native (FCM) devices. A user can have both — browser and phone — and
      // should be reachable on either.
      supabase.from("push_devices").select("token").eq("user_id", n.user_id),
      n.actor_id
        ? supabase.from("profiles").select("display_name, username").eq("id", n.actor_id).maybeSingle()
        : Promise.resolve({ data: null } as any),
      isDmNotif
        ? supabase.from("conversation_members").select("locked_at")
            .eq("conversation_id", n.target_id).eq("user_id", n.user_id).maybeSingle()
        : Promise.resolve({ data: null } as any),
    ]);

  // Checks both transports: bailing on web subscriptions alone would mean a
  // user with only the app installed never receives anything.
  if (!subs?.length && !devices?.length) return NextResponse.json({ sent: 0 });

  const isLocked = isDmNotif && !!memberRow?.locked_at;
  const actorName = actorProfile?.display_name ?? actorProfile?.username ?? "Someone";
  const { title, body } = pushCopy(isLocked ? "locked_dm" : String(n.type ?? ""), actorName, n.body ?? null);
  const payload = JSON.stringify({
    title,
    body,
    url: pushUrl(n, actorProfile?.username ?? null),
    tag: `hypefy-${n.type}-${n.target_id ?? n.id}`,
  });

  const url = pushUrl(n, actorProfile?.username ?? null);
  const tag = `hypefy-${n.type}-${n.target_id ?? n.id}`;

  let sent = 0;
  await Promise.all([
    // ── Web push (browsers)
    ...(subs ?? []).map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
        sent++;
      } catch (err: any) {
        // Subscription expired or revoked — remove it (expected, not an error)
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        } else {
          Sentry.captureException(err, { tags: { route: "push" } });
        }
      }
    }),

    // ── Native push (FCM). Skipped entirely when unconfigured, so a
    //    deployment without Firebase credentials keeps delivering web push
    //    instead of failing the whole notification.
    ...(fcmConfigured()
      ? (devices ?? []).map(async (d) => {
          const result = await sendFcm(d.token, { title, body, url, tag });
          if (result === "sent") sent++;
          // The app was uninstalled or the token rotated. Prune it, or every
          // future push retries a token that can never deliver.
          else if (result === "stale") {
            await supabase.from("push_devices").delete().eq("token", d.token);
          }
        })
      : []),
  ]);

  return NextResponse.json({ sent });
}
