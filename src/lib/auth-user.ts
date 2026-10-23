import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * The signed-in user, asked for once per request.
 *
 * `supabase.auth.getUser()` is not a cookie read — it is an HTTP call to
 * GoTrue, because the point of it is that the server validates the token
 * rather than trusting what the browser sent. That is the right trade, but
 * it means every extra call is another round trip in front of the first
 * byte of the page.
 *
 * There were three or four of them on a normal page load: the proxy, the
 * app layout, `getProfile` inside it, and the page's own. React's `cache`
 * collapses the ones inside the render pass into one, keyed by the render
 * rather than by anything we pass, so callers do not have to thread a user
 * object through to get the saving.
 *
 * Server only — it reaches for cookies(). Client components ask their own
 * browser client, where the session is already in memory.
 */
export const currentUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
