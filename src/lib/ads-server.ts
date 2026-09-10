import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isAdult } from "@/lib/ads";

/**
 * The two ad inputs only the server can supply.
 *
 * Country comes from the edge; the page itself cannot see it. Age comes from
 * the profile, and is decided here rather than in the browser because a
 * browser clock is adjustable and this decides whether a reader who may be
 * fourteen sees a personalised ad. Only the conclusions cross to the client —
 * the date of birth never does.
 *
 * Separate from lib/ads.ts because next/headers cannot be imported into
 * anything a client component touches, and lib/ads.ts is.
 */
export async function getAdContext(
  supabase: SupabaseClient,
  userId: string | null | undefined
): Promise<{ adCountry: string | null; adPersonalised: boolean }> {
  // An absent header stays null, which downstream reads as "consent
  // required" — a misconfigured deploy serves nothing rather than serving
  // into the EEA.
  const adCountry = (await headers()).get("x-vercel-ip-country");

  if (!userId) return { adCountry, adPersonalised: false };

  const { data } = await supabase
    .from("profiles")
    .select("date_of_birth")
    .eq("id", userId)
    .maybeSingle();

  return {
    adCountry,
    adPersonalised: isAdult((data as { date_of_birth?: string | null } | null)?.date_of_birth),
  };
}
