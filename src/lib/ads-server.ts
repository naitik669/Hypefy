import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isAdult } from "@/lib/ads";
import { getPrivateProfile } from "@/lib/profile";

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

  // The reader's own: a date of birth is not readable off the profiles table.
  const mine = await getPrivateProfile(supabase);

  return { adCountry, adPersonalised: isAdult(mine?.dateOfBirth) };
}
