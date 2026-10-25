import type { ChatMsg } from "@/components/messages/RealChatView";
import { one } from "@/lib/supabase/typed";

/**
 * Flattening a message row's joined post / Shot into the ChatMsg shape.
 *
 * Lives here rather than in RealChatView because the thread page (a server
 * component) needs it too, and a function exported from a "use client" module
 * is not callable on the server. It was previously copy-pasted into both,
 * each copy taking `any`.
 */

type Joined = { profiles?: unknown };
type MaybeMany<T> = T | T[] | null | undefined;

/** The profile embedded in a joined post or Shot, if there is one. */
function profileOf(x: MaybeMany<Joined>): ChatMsg["postProfile"] {
  const row = one(x);
  return row ? (one(row.profiles) as ChatMsg["postProfile"]) : null;
}

/** The joined post or Shot itself, with its embedded profile dropped. */
function withoutProfile<T extends Joined>(x: MaybeMany<T>) {
  const row = one(x);
  return row ? { ...row, profiles: undefined } : null;
}

export function mapMessageRow<M extends { post?: MaybeMany<Joined>; shot?: MaybeMany<Joined> }>(
  m: M,
): ChatMsg {
  // The row's `metadata` is `Json` and its joins are wider than the previews
  // ChatMsg declares, so the result is asserted rather than inferred.
  return {
    ...m,
    post: m.post ? withoutProfile(m.post) : null,
    postProfile: m.post ? profileOf(m.post) : null,
    shot: m.shot ? withoutProfile(m.shot) : null,
    shotProfile: m.shot ? profileOf(m.shot) : null,
  } as unknown as ChatMsg;
}
