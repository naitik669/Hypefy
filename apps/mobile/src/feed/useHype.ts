import { useCallback, useState } from "react";
import { optimistic, settle, type HypeState } from "@hypefy/core/hype";
import { supabase } from "@/supabase";

/**
 * Hyping one post, with the optimistic update and the rollback.
 *
 * The first write the phone makes. The three rules it has to get right are
 * in @hypefy/core/hype, shared with the web's FeedCard, so what is left
 * here is the round trip and the in-flight guard:
 *
 *  - **One at a time.** Two overlapping toggles on one row race, and
 *    whichever RPC answers last wins — so the count settles on a value
 *    neither tap asked for. Refusing the second tap is cheaper than
 *    reconciling them, and it is what the web does.
 *  - **Roll back to what was there BEFORE**, not to the opposite of now.
 *    Those are the same thing until two taps overlap, which the guard
 *    prevents — so this is belt and braces, and cheap.
 *
 * `toggle_hype` is the same RPC the web calls, with the same three
 * arguments. It does the counting server-side and returns the true state,
 * which is why `settle` exists: the client's guess is for the 200ms before
 * the answer arrives, not the thing of record.
 *
 * No toast, because the app has no toast yet. A failure puts the star and
 * the count back, which says "that did not happen" — quieter than the
 * web's message and the honest version of what this screen can do today.
 */
export function useHype(
  postId: string,
  ownerId: string,
  initial: HypeState,
): {
  state: HypeState;
  pending: boolean;
  failed: boolean;
  toggle: () => void;
} {
  const [state, setState] = useState<HypeState>(initial);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const toggle = useCallback(() => {
    if (pending) return;
    const before = state;
    const guess = optimistic(before);
    setPending(true);
    setFailed(false);
    setState(guess);

    void (async () => {
      try {
        const { data, error } = await supabase.rpc("toggle_hype", {
          p_target_type: "post",
          p_target_id: postId,
          p_owner_id: ownerId,
        });
        if (error) throw error;
        setState(settle(guess, data));
      } catch {
        setState(before);
        setFailed(true);
      } finally {
        setPending(false);
      }
    })();
  }, [pending, state, postId, ownerId]);

  return { state, pending, failed, toggle };
}
