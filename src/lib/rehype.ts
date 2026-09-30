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
): Promise<RehypeResult> {
  const { table, column } = TABLE[kind];
  try {
    if (next) {
      const { error } = await db.from(table).insert({ user_id: userId, [column]: targetId });
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
