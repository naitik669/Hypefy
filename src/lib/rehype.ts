/**
 * Rehype: resharing a post or a Shot to your followers.
 *
 * The same act on two kinds of thing, stored in two tables (`reposts` for
 * posts — the name it already had — and `shot_reposts`). Callers should not
 * have to know that, so everything here takes the kind and picks the table.
 *
 * The database enforces the rules that matter (migration 0106): you can only
 * rehype something you can see, never a private account's (unless it is
 * yours), and once. This file only has to report honestly what happened.
 */

export type RehypeKind = "post" | "shot";

/** The slice of the Supabase client this needs. Kept loose so tests can fake it. */
type Db = {
  from: (table: string) => {
    insert: (row: Record<string, string>) => PromiseLike<{ error: { message: string; code?: string } | null }>;
    delete: () => {
      eq: (col: string, v: string) => {
        eq: (col: string, v: string) => PromiseLike<{ error: { message: string; code?: string } | null }>;
      };
    };
    select: (cols: string) => {
      eq: (col: string, v: string) => {
        eq: (col: string, v: string) => {
          maybeSingle: () => PromiseLike<{ data: unknown; error: unknown }>;
        };
      };
    };
  };
};

const TABLE: Record<RehypeKind, { table: string; column: string }> = {
  post: { table: "reposts", column: "post_id" },
  shot: { table: "shot_reposts", column: "shot_id" },
};

/** Has this person rehyped this thing? False on any failure — the button just shows off. */
export async function isRehyped(
  db: Db,
  userId: string,
  kind: RehypeKind,
  targetId: string,
): Promise<boolean> {
  const { table, column } = TABLE[kind];
  try {
    const { data } = await db.from(table).select("id").eq("user_id", userId).eq(column, targetId).maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

export type RehypeResult =
  | { ok: true; rehyped: boolean }
  /** The database refused: a private account's post, or one you cannot see. */
  | { ok: false; reason: "not-allowed" }
  | { ok: false; reason: "failed" };

/**
 * Turn a rehype on or off.
 *
 * Idempotent in the way a person expects: turning on something already on,
 * or off something already off, is a success with the state they asked for.
 * A unique violation on insert is that case — two taps, or a second tab.
 */
export async function setRehype(
  db: Db,
  userId: string,
  kind: RehypeKind,
  targetId: string,
  next: boolean,
  /** Whose rehype brought it to you. Recorded for the relay route (parked
   *  for now; the database keeps the links). The database drops it if that
   *  person did not in fact rehype this. */
  via?: string | null,
): Promise<RehypeResult> {
  const { table, column } = TABLE[kind];
  try {
    if (next) {
      const row: Record<string, string> = { user_id: userId, [column]: targetId };
      if (via && via !== userId) row.via_user_id = via;
      const { error } = await db.from(table).insert(row);
      if (!error) return { ok: true, rehyped: true };
      if (error.code === "23505" || /duplicate|unique/i.test(error.message)) {
        return { ok: true, rehyped: true };
      }
      // RLS rejects an insert with 42501 / "row-level security".
      if (error.code === "42501" || /row-level security|violates/i.test(error.message)) {
        return { ok: false, reason: "not-allowed" };
      }
      return { ok: false, reason: "failed" };
    }

    const { error } = await db.from(table).delete().eq("user_id", userId).eq(column, targetId);
    return error ? { ok: false, reason: "failed" } : { ok: true, rehyped: false };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/** What the thread says, so the wording lives in one place. */
export function rehypedBy(name: string | null | undefined): string {
  return `${name?.trim() || "Someone"} rehyped`;
}

// ── the deck ───────────────────────────────────────

/** One face in the deck. */
export type DeckPerson = {
  userId: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  hue: number;
  isMe: boolean;
};

/** Faces the deck ever shows at once. */
export const DECK_SEATS = 3;

type Rpc = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
};

type PersonRow = {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  avatar_hue: number | null;
  is_me?: boolean;
  rank?: number;
};

function toPerson(r: PersonRow, meId?: string): DeckPerson {
  return {
    userId: r.user_id,
    name: r.display_name?.trim() || r.username || "Someone",
    username: r.username,
    avatarUrl: r.avatar_url,
    hue: r.avatar_hue ?? 200,
    isMe: r.is_me ?? r.user_id === meId,
  };
}

/**
 * Who is in the deck: your own rehype, if any, and the three people whose
 * rehypes rank highest for you, best first.
 *
 * The ranking is done in the database (rehype_deck, migration 0108): how much
 * you and each person actually interact — hypes, comments, saves, rehypes and
 * chats, both ways, decaying over 60 days — plus how fresh their rehype is and
 * whether you follow them. Empty on any failure — no deck is shown.
 */
export async function fetchDeck(
  db: Rpc,
  kind: RehypeKind,
  targetId: string,
): Promise<{ others: DeckPerson[]; me: DeckPerson | null }> {
  try {
    const { data, error } = await db.rpc("rehype_deck", { p_kind: kind, p_target: targetId });
    if (error || !Array.isArray(data)) return { others: [], me: null };
    const rows = data as PersonRow[];
    const me = rows.find((r) => r.is_me);
    return {
      me: me ? toPerson(me) : null,
      others: rows
        .filter((r) => !r.is_me)
        .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
        .map((r) => toPerson(r)),
    };
  } catch {
    return { others: [], me: null };
  }
}

const meCache = new Map<string, Promise<DeckPerson | null>>();

type ProfileDb = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, v: string) => { maybeSingle: () => PromiseLike<{ data: unknown; error: unknown }> };
    };
  };
};

/**
 * Your own face, so a rehype can seat you the moment you tap instead of after
 * a round trip. Fetched once per session and shared by every post and Shot.
 * Null on failure — you are then seated when the deck next loads.
 */
export function fetchMe(db: ProfileDb, userId: string): Promise<DeckPerson | null> {
  const hit = meCache.get(userId);
  if (hit) return hit;
  const load = (async () => {
    try {
      const { data, error } = await db
        .from("profiles")
        .select("display_name, username, avatar_url, avatar_hue")
        .eq("id", userId)
        .maybeSingle();
      if (error || !data) return null;
      return toPerson({ ...(data as Omit<PersonRow, "user_id">), user_id: userId, is_me: true });
    } catch {
      return null;
    }
  })();
  meCache.set(userId, load);
  // A failure is not remembered, so the next post tries again.
  void load.then((me) => {
    if (!me) meCache.delete(userId);
  });
  return load;
}

/**
 * Who sits where.
 *
 * Three seats, best-ranked first. Once you rehype, you take the last seat —
 * the one ranked lowest for you — so only that seat changes and nothing else
 * in the row moves. With room to spare you simply join the end.
 */
export function seatDeck(others: DeckPerson[], me: DeckPerson | null, rehyped: boolean): DeckPerson[] {
  const shown = others.slice(0, DECK_SEATS);
  if (!rehyped || !me) return shown;
  if (shown.length >= DECK_SEATS) return [...shown.slice(0, DECK_SEATS - 1), me];
  return [...shown, me];
}
