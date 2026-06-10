import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabase } from "@supabase/supabase-js";
import webpush from "web-push";

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
  webpush.setVapidDetails("mailto:craziematez@gmail.com", publicKey, privateKey);

  const n = await req.json();
  if (!n?.user_id) return NextResponse.json({ error: "bad payload" }, { status: 400 });

  const supabase = adminClient();

  const [{ data: subs }, { data: actorProfile }] = await Promise.all([
    supabase.from("push_subscriptions").select("endpoint, p256dh, auth").eq("user_id", n.user_id),
    n.actor_id
      ? supabase.from("profiles").select("display_name, username").eq("id", n.actor_id).maybeSingle()
      : Promise.resolve({ data: null } as any),
  ]);

  if (!subs?.length) return NextResponse.json({ sent: 0 });

  const actorName = actorProfile?.display_name ?? actorProfile?.username ?? "Someone";
  const { title, body } = pushCopy(String(n.type ?? ""), actorName, n.body ?? null);
  const payload = JSON.stringify({
    title,
    body,
    url: pushUrl(n, actorProfile?.username ?? null),
    tag: `hypefy-${n.type}-${n.target_id ?? n.id}`,
  });

  let sent = 0;
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
        sent++;
      } catch (err: any) {
        // Subscription expired or revoked — remove it
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        }
      }
    }),
  );

  return NextResponse.json({ sent });
}
