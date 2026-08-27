import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Supabase client for use in Client Components (browser).
 * Reads the public URL + anon key from env. Both are safe to expose.
 *
 * Typed with the generated Database schema, so table columns and RPC
 * signatures are checked at every call site. Embedded relations still come
 * back as `T | T[]` — unwrap those with `one()` from ./typed.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
