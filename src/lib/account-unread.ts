import { createClient } from "@supabase/supabase-js";
import type { SavedAccount } from "@/lib/saved-accounts";

/**
 * What is waiting on an account you are not currently signed in as.
 *
 * Each saved account keeps its own tokens on this device, so the counts are
 * asked for as that person — a separate client per account, carrying their
 * token and nothing else. Nothing is cached between opens: a count that is
 * quietly hours old is worse than no count.
 */

export type Unread = {
  /** Chats with something unread. */
  chats: number;
  /** Unread notifications. */
  activity: number;
};

/** Nothing could be asked — an expired token, or no network. Not the same as zero. */
export type UnreadResult = Unread | null;

/** The slice of a client this needs, so a test can hand it one. */
export type Asker = {
  rpc: (fn: string) => PromiseLike<{ data: unknown; error: unknown }>;
  from: (table: string) => {
    select: (
      cols: string,
      opts: { count: "exact"; head: true },
    ) => {
      eq: (col: string, value: unknown) => {
        eq: (col: string, value: unknown) => PromiseLike<{ count: number | null; error: unknown }>;
      };
    };
  };
};

/** A client that speaks as one saved account. */
export function asAccount(account: SavedAccount): Asker {
  // Cast at the boundary: the generated schema types make the checker walk
  // the whole database to prove a two-call shape it already describes above.
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${account.accessToken}` } },
    },
  ) as unknown as Asker;
}

/**
 * The two numbers for one account.
 *
 * Returns null rather than zeroes when the account cannot be read: a saved
 * token expires, and "nothing new" would be a lie the switcher then shows
 * next to a name with ten unread chats behind it.
 */
export async function unreadFor(
  account: SavedAccount,
  /** How to reach that account. The real client, unless a test says otherwise. */
  ask: (account: SavedAccount) => Asker = asAccount,
): Promise<UnreadResult> {
  try {
    const supabase = ask(account);
    const [chats, activity] = await Promise.all([
      supabase.rpc("unread_dm_count"),
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", account.userId)
        .eq("is_read", false),
    ]);

    if (chats.error || activity.error) return null;
    return {
      chats: typeof chats.data === "number" ? chats.data : 0,
      activity: activity.count ?? 0,
    };
  } catch {
    return null;
  }
}

/** Every account's counts, asked for together. One failing says nothing about the rest. */
export async function unreadForAll(
  accounts: SavedAccount[],
  ask?: (account: SavedAccount) => Asker,
): Promise<Record<string, UnreadResult>> {
  const pairs = await Promise.all(
    accounts.map(async (a) => [a.userId, await unreadFor(a, ask)] as const),
  );
  return Object.fromEntries(pairs);
}

/** Is there anything at all to show for this account? */
export function hasAny(u: UnreadResult | undefined): u is Unread {
  return !!u && (u.chats > 0 || u.activity > 0);
}
