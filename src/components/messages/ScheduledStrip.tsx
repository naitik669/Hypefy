"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/ToastProvider";
import { describeWhen } from "@/lib/schedule-send";

type Pending = { id: string; body: string; scheduled_at: string };

/**
 * What is queued to go in this conversation, and a way to call it back.
 *
 * A message you cannot see is a message you cannot change your mind about,
 * and "send later" is used most often for things worth changing your mind
 * about. So the thread carries a line for each one, above the composer,
 * until it goes.
 *
 * Only the sender ever sees this — the RLS policy on scheduled_messages is
 * sender-only, so the recipient has no way to learn that something is
 * pending, which would spoil the point of sending it later.
 *
 * Refreshed on a timer rather than by realtime. scheduled_messages is not in
 * the publication (see 0155 for what happens when something subscribes to a
 * table that is not), and the resolution that matters here is "about a
 * minute", which is also how often the publisher runs.
 */
export function ScheduledStrip({ conversationId }: { conversationId: string }) {
  // Made once, not per render. load() depends on it and the effect depends
  // on load, so a client with a fresh identity each render would re-run the
  // effect, set state, and re-render for ever. createBrowserClient happens
  // to memoise, which hides this everywhere except where something hands
  // the component a different factory — exactly what the chat tests do.
  const [supabase] = useState(createClient);
  const toast = useToast();
  const [rows, setRows] = useState<Pending[]>([]);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("scheduled_messages")
      .select("id, body, scheduled_at")
      .eq("conversation_id", conversationId)
      .order("scheduled_at", { ascending: true });
    setRows((data ?? []) as Pending[]);
  }, [supabase, conversationId]);

  useEffect(() => {
    // load() is async, so setRows runs after the fetch rather than during
    // this render; the rule cannot see past the call, and fetching on mount
    // is what an effect is for.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch
    void load();
    // A minute matches the publisher's cadence: a message that has just gone
    // should stop being listed as pending at about the time it arrives.
    const timer = setInterval(() => void load(), 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  async function cancel(id: string) {
    // Removed from the list first: the row is the sender's own and the
    // delete is a formality, and waiting on a round trip to acknowledge a
    // cancel feels like the cancel did not take.
    const before = rows;
    setRows((r) => r.filter((x) => x.id !== id));
    const { error } = await supabase.from("scheduled_messages").delete().eq("id", id);
    if (error) {
      setRows(before);
      toast("Couldn't cancel that.", "error");
    }
  }

  if (rows.length === 0) return null;
  const now = new Date();

  return (
    <div className="flex flex-col gap-1 px-3 pb-1">
      {rows.map((r) => (
        <div
          key={r.id}
          className="flex items-center gap-2 rounded-xl border border-border/60 bg-surface/80 px-3 py-1.5"
        >
          <Clock size={13} className="shrink-0 text-accent" />
          <span className="shrink-0 text-[11px] font-bold text-accent">
            {describeWhen(new Date(r.scheduled_at), now)}
          </span>
          <span className="min-w-0 flex-1 truncate text-[11px] text-muted">{r.body}</span>
          <button
            type="button"
            onClick={() => void cancel(r.id)}
            aria-label={`Cancel the message scheduled for ${describeWhen(new Date(r.scheduled_at), now)}`}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-faint transition-colors hover:text-foreground"
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
