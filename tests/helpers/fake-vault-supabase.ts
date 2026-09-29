import type { KeyVault } from "@/lib/e2ee/keys";

/**
 * A stand-in for `user_keys` that behaves the way migrations 0103 and 0104
 * make the real one behave.
 *
 * The rules it enforces are the ones worth being wrong about:
 *   - init refuses to overwrite, and answers false when a row was there;
 *   - a vault must have a recovery wrapper, and the two halves of a password
 *     wrapper travel together;
 *   - a new vault is unconfirmed, and `public_keys` hides unconfirmed ones;
 *   - confirming is one way and keeps the first timestamp;
 *   - a rewrap touches only its own columns.
 *
 * The SQL itself was exercised against the real database under
 * impersonation. What this checks is the client's side of the same contract.
 */

export type FakeRow = KeyVault & { rc_confirmed_at: string | null };

export function fakeVaultSupabase(initialUser: string | null) {
  const rows = new Map<string, FakeRow>();
  let me: string | null = initialUser;
  const calls: string[] = [];

  const client = {
    rows,
    calls,
    /** Act as somebody else — a second account on the same fake database. */
    as(id: string | null) {
      me = id;
    },
    /** Every request now fails, the way an unreachable server does. */
    signOut() {
      me = null;
    },
    /** Rpc names that wrote something, in order. */
    writes() {
      return calls.filter((c) => c !== "select" && c !== "public_keys");
    },
    from() {
      return {
        select() {
          return {
            async maybeSingle() {
              calls.push("select");
              if (!me) return { data: null, error: { message: "not signed in" } };
              return { data: rows.get(me) ?? null, error: null };
            },
          };
        },
      };
    },
    async rpc(name: string, args?: Record<string, string | string[] | null>) {
      calls.push(name);
      if (!me) return { data: null, error: { message: "Not signed in" } };
      const a = args ?? {};

      if (name === "init_user_keys") {
        if (a.p_mk_wrapped_rc == null || a.p_salt_rc == null) {
          return { data: null, error: { message: "A vault must have a recovery wrapper" } };
        }
        if ((a.p_mk_wrapped_pw == null) !== (a.p_salt_pw == null)) {
          return { data: null, error: { message: "violates check constraint user_keys_pw_wrapper_whole" } };
        }
        // on conflict do nothing: false when a row was already there.
        if (rows.has(me)) return { data: false, error: null };
        rows.set(me, {
          identity_pub: a.p_identity_pub as string,
          signing_pub: a.p_signing_pub as string,
          seed_wrapped: a.p_seed_wrapped as string,
          mk_wrapped_pw: (a.p_mk_wrapped_pw as string | null) ?? null,
          salt_pw: (a.p_salt_pw as string | null) ?? null,
          mk_wrapped_rc: a.p_mk_wrapped_rc as string,
          salt_rc: a.p_salt_rc as string,
          rc_confirmed_at: null,
        });
        return { data: true, error: null };
      }

      const row = rows.get(me);

      if (name === "rewrap_master_key") {
        if (!row) return { data: null, error: { message: "No keys to rewrap" } };
        rows.set(me, {
          ...row,
          mk_wrapped_pw: a.p_mk_wrapped_pw as string,
          salt_pw: a.p_salt_pw as string,
        });
        return { data: null, error: null };
      }

      if (name === "rewrap_recovery") {
        if (!row) return { data: null, error: { message: "No keys to rewrap" } };
        rows.set(me, {
          ...row,
          mk_wrapped_rc: a.p_mk_wrapped_rc as string,
          salt_rc: a.p_salt_rc as string,
        });
        return { data: null, error: null };
      }

      if (name === "confirm_recovery") {
        if (!row) return { data: null, error: { message: "No keys to confirm" } };
        rows.set(me, { ...row, rc_confirmed_at: row.rc_confirmed_at ?? new Date().toISOString() });
        return { data: null, error: null };
      }

      if (name === "drop_password_wrapper") {
        if (!row) return { data: null, error: { message: "No keys to change" } };
        rows.set(me, { ...row, mk_wrapped_pw: null, salt_pw: null });
        return { data: null, error: null };
      }

      if (name === "public_keys") {
        const ids = a.p_user_ids as string[];
        return {
          data: ids
            .filter((id) => rows.get(id)?.rc_confirmed_at)
            .map((id) => ({
              user_id: id,
              identity_pub: rows.get(id)!.identity_pub,
              signing_pub: rows.get(id)!.signing_pub,
            })),
          error: null,
        };
      }

      return { data: null, error: { message: "unknown rpc " + name } };
    },
  };

  // The real client is a large generated type; the surface used here is the
  // whole surface the vault module touches.
  return client;
}

/** The shape vault.ts expects, without re-deriving the generated type. */
export type FakeSupa = ReturnType<typeof fakeVaultSupabase>;
