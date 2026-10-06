import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildIceServers } from "@/lib/ice";

/**
 * GET /api/calls/ice — the servers a call should use, for the signed-in
 * caller. See src/lib/ice.ts for why this is asked for rather than built in
 * the browser.
 *
 * Never cached: with a relay secret configured, the login inside is good for
 * an hour and belongs to one person.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  return NextResponse.json(
    { iceServers: buildIceServers(process.env, user.id) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
