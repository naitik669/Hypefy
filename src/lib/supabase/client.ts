import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for use in Client Components (browser).
 * Reads the public URL + anon key from env. Both are safe to expose.
 *
 * NOTE: Generated DB types live in ./database.types.ts. Wiring them in here
 * (`createBrowserClient<Database>`) surfaces ~40 pre-existing nullability /
 * RPC-return type mismatches across the app; that retrofit is tracked
 * separately. Use the types explicitly in new code in the meantime.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
