import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * The list of Hypefy pages worth reading from outside.
 *
 * There was no sitemap before, and without one the only public pages —
 * profiles, posts and shots — were unreachable in practice: nothing links to
 * them from the front door, so a crawler that lands on the intro carousel
 * finds a sign-up form and stops. That is also why an ad network reviewing
 * this site concluded there was nothing on it.
 *
 * Built with a PLAIN anon client, deliberately, rather than the cookie-bound
 * server client. A sitemap must describe what an anonymous stranger can read,
 * and a cookie-bound client would answer for whoever happened to request it —
 * so an admin fetching /sitemap.xml could publish a list of pages nobody else
 * can open. RLS as `anon` is exactly the right lens here, and using it means
 * private profiles, suspended accounts and removed posts fall out on their
 * own rather than by a filter someone has to remember to maintain.
 *
 * Being in here is not what makes a page public — these URLs were already
 * reachable by anyone holding the link. It is what makes them findable, which
 * is a different and larger thing, and the reason the caps below exist.
 */

const BASE = "https://app.hypefy.chat";

/** Cap per section. A sitemap over 50,000 URLs has to be split into an index. */
const MAX_PROFILES = 5000;
const MAX_POSTS = 20000;
const MAX_SHOTS = 5000;

/** Re-read hourly. Fresh enough for new posts, cheap enough to serve. */
export const revalidate = 3600;

function anon() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    // No session, ever. This client exists to see what a stranger sees.
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

/**
 * Run a query, and treat any failure as an empty section.
 *
 * PostgrestBuilder is thenable but not a Promise, so it has no .catch — the
 * try/catch is not a style choice.
 */
async function safe<T>(run: () => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  try {
    return (await run()).data ?? [];
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const fixed: MetadataRoute.Sitemap = [
    { url: BASE, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${BASE}/onboarding`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/privacy`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE}/terms`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE}/guidelines`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
  ];

  const supabase = anon();

  // Everything below is best-effort. A sitemap that throws is a sitemap that
  // 500s, and a 500 here is read as "this site is broken" by the one crawler
  // we are trying to convince — so a failed query costs us that section and
  // nothing else.
  const [profiles, posts, shots] = await Promise.all([
    safe(() =>
      supabase
        .from("profiles")
        .select("username, updated_at")
        .not("username", "is", null)
        .eq("is_private", false)
        .is("suspended_at", null)
        .order("updated_at", { ascending: false })
        .limit(MAX_PROFILES)
    ),
    safe(() =>
      supabase
        .from("posts")
        .select("id, updated_at")
        .is("removed_at", null)
        .order("created_at", { ascending: false })
        .limit(MAX_POSTS)
    ),
    safe(() =>
      supabase
        .from("shots")
        .select("id, created_at")
        .order("created_at", { ascending: false })
        .limit(MAX_SHOTS)
    ),
  ]);

  return [
    ...fixed,
    ...profiles.map((p) => ({
      url: `${BASE}/u/${encodeURIComponent(p.username as string)}`,
      lastModified: p.updated_at ? new Date(p.updated_at) : now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...posts.map((p) => ({
      url: `${BASE}/p/${p.id}`,
      lastModified: p.updated_at ? new Date(p.updated_at) : now,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    ...shots.map((s) => ({
      url: `${BASE}/shots/${s.id}`,
      lastModified: s.created_at ? new Date(s.created_at) : now,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
  ];
}
