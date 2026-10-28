"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Users, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type State =
  | { kind: "working" }
  | { kind: "pending" }
  | { kind: "failed"; why: string };

/**
 * Walking in through a link.
 *
 * It tries once, on arrival, and says what happened. There is nothing to
 * read before deciding, because there is nothing it is allowed to show:
 * the group's name, picture and size all belong to people who have not
 * agreed to let this person see them yet. A link is a door, not a window.
 *
 * Joining navigates straight into the chat — the thing the link was for.
 * Waiting says so and stops, because there is nowhere to send somebody
 * who is not in yet.
 */
export function JoinByInvite({ code }: { code: string }) {
  const router = useRouter();
  const [supabase] = useState(createClient);
  const [state, setState] = useState<State>({ kind: "working" });
  // Strict Mode mounts twice in development, and joining is not something
  // to do twice — the second call is harmless ("already") but the race
  // between two navigations is not.
  const tried = useRef(false);

  useEffect(() => {
    if (tried.current) return;
    tried.current = true;
    void (async () => {
      const { data, error } = await supabase.rpc("join_by_invite", { p_code: code });
      if (error) {
        setState({ kind: "failed", why: error.message });
        return;
      }
      const result = data as { conversation_id?: string; outcome?: string } | null;
      if (result?.outcome === "pending") {
        setState({ kind: "pending" });
        return;
      }
      if (result?.conversation_id) {
        // Replace, so Back goes where they came from rather than through
        // a join they have already made.
        router.replace(`/messages/${result.conversation_id}`);
        return;
      }
      setState({ kind: "failed", why: "That link does not work any more" });
    })();
  }, [supabase, code, router]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-8 text-center">
      {state.kind === "working" && (
        <>
          <Loader2 size={28} className="animate-spin text-accent" aria-hidden />
          <p className="text-sm text-muted">Opening the chat…</p>
        </>
      )}

      {state.kind === "pending" && (
        <>
          <span className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-accent/15 text-accent">
            <Check size={26} />
          </span>
          <p className="text-base font-bold">Asked to join</p>
          <p className="max-w-xs text-sm text-muted">
            An admin has to let you in. You will see the chat in Messages once they do.
          </p>
          <button
            type="button"
            onClick={() => router.replace("/messages")}
            className="mt-1 flex h-11 items-center justify-center rounded-xl bg-accent px-6 text-sm font-bold text-accent-ink transition active:scale-[0.99]"
          >
            Go to Messages
          </button>
        </>
      )}

      {state.kind === "failed" && (
        <>
          <span className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-surface text-muted">
            <X size={26} />
          </span>
          <p className="text-base font-bold">{state.why}</p>
          <p className="max-w-xs text-sm text-muted">
            Ask whoever sent it for a new one.
          </p>
          <button
            type="button"
            onClick={() => router.replace("/messages")}
            className="mt-1 flex h-11 items-center gap-2 rounded-xl bg-surface px-6 text-sm font-semibold text-foreground transition active:scale-[0.99]"
          >
            <Users size={16} />
            Messages
          </button>
        </>
      )}
    </div>
  );
}
