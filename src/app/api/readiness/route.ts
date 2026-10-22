import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { razorpayEnv } from "@/lib/billing/razorpay";
import { buildIceServers } from "@/lib/ice";

export const runtime = "nodejs";

/**
 * GET /api/readiness — which of the services this app is built against are
 * actually switched on in this deployment.
 *
 * Several features are complete in code and dark in production because a key
 * is missing: calls fall back to STUN with no relay, billing answers 503
 * with no Razorpay keys, push cannot be sent without VAPID or FCM. Each
 * failure is quiet and looks like a bug in the feature rather than a gap in
 * the configuration, and the only way to tell them apart was to read the
 * source and then go hunting in two dashboards.
 *
 * Booleans only, in the shape of `/api/spotify/diagnose`: whether a value is
 * present, never the value. Admin-gated rather than merely signed-in,
 * because together these answers describe the whole deployment's posture —
 * a map of what is and is not defended.
 *
 * `ok` is the question "could this ship": every entry marked required is on.
 */

const has = (v: string | undefined) => typeof v === "string" && v.trim().length > 0;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "sign in first" }, { status: 401 });

  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (isAdmin !== true) return NextResponse.json({ error: "not allowed" }, { status: 403 });

  const env = process.env;

  // A relay is the difference between calls that work on mobile data and
  // calls that only work on Wi-Fi, so this asks the real builder rather
  // than re-reading the variables: whatever it would hand a caller is what
  // a caller gets.
  const ice = buildIceServers(env, user.id);
  const hasRelay = ice.some((s) => s.urls.some((u) => u.startsWith("turn:") || u.startsWith("turns:")));

  const checks = {
    calls: {
      required: true,
      on: hasRelay,
      note: hasRelay ? "relay configured" : "STUN only — calls fail on most mobile data",
    },
    billing: {
      required: false,
      on: razorpayEnv() !== null,
      note: "Razorpay keys and both plan ids",
    },
    push_web: {
      required: true,
      on: has(env.VAPID_PRIVATE_KEY) && has(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) && has(env.PUSH_CONTACT_EMAIL),
      note: "VAPID pair and a contact address",
    },
    push_native: {
      required: true,
      on: has(env.FCM_SERVICE_ACCOUNT),
      note: "FCM service account for the Android app",
    },
    push_cron: {
      required: true,
      on: has(env.PUSH_WEBHOOK_SECRET),
      note: "the secret pg_cron calls /api/push with",
    },
    spotify: { required: false, on: has(env.SPOTIFY_CLIENT_ID) && has(env.SPOTIFY_CLIENT_SECRET), note: "" },
    giphy: { required: false, on: has(env.GIPHY_API_KEY), note: "the GIF picker" },
    ads: { required: false, on: has(env.NEXT_PUBLIC_ADSENSE_CLIENT), note: "" },
    invite_gate: {
      required: false,
      on: has(env.APP_INVITE_CODE),
      note: "ON means the app is still behind a code — a store reviewer cannot get in",
    },
    oneshot_reap: { required: true, on: has(env.ONESHOT_REAP_SECRET), note: "the secret that expires view-once photos" },
    service_role: { required: true, on: has(env.SUPABASE_SERVICE_ROLE_KEY), note: "account deletion and admin work" },
  };

  const missing = Object.entries(checks)
    .filter(([, c]) => c.required && !c.on)
    .map(([k]) => k);

  return NextResponse.json(
    {
      ok: missing.length === 0,
      missing,
      checks,
      // Not a check: email cannot be seen from here. Supabase's own sender
      // is configured in its dashboard, not in this environment, and it is
      // the one piece of launch configuration nothing in this process can
      // observe — so it is named here rather than quietly left out.
      cannotSeeFromHere: ["Supabase custom SMTP", "Supabase leaked-password protection"],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
