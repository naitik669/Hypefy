import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildIceServers } from "@/lib/ice";
import { guardApi } from "@/lib/api-guard";

/**
 * GET /api/calls/ice — the servers a call should use, for the signed-in
 * caller. See src/lib/ice.ts for why this is asked for rather than built in
 * the browser.
 *
 * Never cached: with a relay secret configured, the login inside is good for
 * an hour and belongs to one person.
 *
 * Capped, because that login is spendable. A relay carries other people's
 * traffic at the owner's cost, so an uncapped mint is an invitation to
 * collect credentials in a loop. The browser keeps one for 30 minutes, so
 * the cap sits far above any real use — and a refusal is safe either way:
 * getRtcConfig reads any non-ok answer as "no relay" and places the call
 * over STUN, so this can slow an abuser without dropping a call.
 */
export async function GET() {
  const blocked = await guardApi("ice");
  if (blocked) return blocked;

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
