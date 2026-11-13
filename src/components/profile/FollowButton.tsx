"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/ToastProvider";

type FollowState = "none" | "requested" | "following";

const FOLLOW_EVENT = "hypefy:follow";

export function FollowButton({
  targetUserId,
  initialFollowing,
  initialRequested = false,
  variant = "block",
  className = "",
  followLabel = "Follow",
}: {
  currentUserId?: string;
  targetUserId: string;
  targetUsername?: string | null;
  initialFollowing: boolean;
  initialRequested?: boolean;
  /** "block" fills its row (profile header, sheets). "inline" is a pill sized
   *  to sit at the end of a list row without stretching it. */
  variant?: "block" | "inline" | "cta" | "mini";
  className?: string;
  /** What the button says before you follow, e.g. "Follow maya". */
  followLabel?: string;
}) {
  const supabase = createClient();
  const toast = useToast();
  const [state, setState] = useState<FollowState>(
    initialFollowing ? "following" : initialRequested ? "requested" : "none"
  );
  const [pending, setPending] = useState(false);

  useEffect(() => {
    function sync(e: Event) {
      const d = (e as CustomEvent<{ target: string; state: FollowState }>).detail;
      if (d?.target === targetUserId) setState(d.state);
    }
    window.addEventListener(FOLLOW_EVENT, sync);
    return () => window.removeEventListener(FOLLOW_EVENT, sync);
  }, [targetUserId]);

  function announce(next: FollowState) {
    setState(next);
    window.dispatchEvent(new CustomEvent(FOLLOW_EVENT, { detail: { target: targetUserId, state: next } }));
  }

  async function toggle() {
    if (pending) return;
    const prev = state;
    setPending(true);

    // follow_user / unfollow_user are SECURITY DEFINER RPCs that own the follow
    // row + its notification, and gate private accounts behind a request.
    if (prev === "none") {
      announce("following"); // optimistic; corrected from the RPC's return
      const { data, error } = await supabase.rpc("follow_user", {
        p_target: targetUserId,
      });
      // A follow that silently reverts is the one failure that quietly
      // produces an empty feed later, so it has to be said out loud.
      if (error) {
        announce(prev);
        toast("Couldn't follow. Try again.", "error");
      } else announce(data === "requested" ? "requested" : "following");
    } else {
      announce("none"); // covers both unfollow and cancel-request
      const { error } = await supabase.rpc("unfollow_user", {
        p_target: targetUserId,
      });
      if (error) {
        announce(prev);
        toast("Couldn't update that. Try again.", "error");
      }
    }
    setPending(false);
  }

  const label =
    state === "following"
      ? "Following"
      : state === "requested"
      ? "Requested"
      : followLabel;
  const filled = state === "none";

  /**
   * Every word this button can say, so it is one width in all of them.
   *
   * "Follow" is six characters and "Following" is nine, so a button sized
   * to its text changed width under the thumb that pressed it — and in a
   * feed, where the ⋯ sits beside it, that shifts the ⋯ too.
   *
   * They are stacked in one grid cell rather than given a min-width in
   * pixels: a measured guess is only right for the font it was measured
   * in, and this is right by construction. The widest reserves the space,
   * the others are hidden from the screen and from a reader.
   */
  const widths = [...new Set([followLabel, "Following", "Requested"])];

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className={`flex items-center justify-center font-bold transition-colors disabled:opacity-60 ${
        variant === "inline"
          ? "h-8 shrink-0 rounded-pill px-4 text-xs"
          : variant === "mini"
          ? "rounded-[10px] px-3 py-1.5 text-[11.5px] font-extrabold active:scale-95"
          : variant === "cta"
          ? "rounded-[14px] px-5 py-2.5 text-sm font-extrabold active:scale-95"
          : "h-10 flex-1 rounded-xl text-sm"
      } ${
        filled
          ? "bg-foreground text-background hover:bg-foreground/90"
          : "border border-border bg-surface text-foreground hover:bg-elevated"
      } ${className}`}
    >
      <span className="grid">
        {widths.map((w) => (
          <span
            key={w}
            aria-hidden={w !== label}
            className={`col-start-1 row-start-1 ${w === label ? "" : "invisible"}`}
          >
            {w === label ? label : w}
          </span>
        ))}
      </span>
    </button>
  );
}
