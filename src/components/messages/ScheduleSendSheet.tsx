"use client";

import { useState } from "react";
import { Clock, Loader2 } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { useToast } from "@/components/ui/ToastProvider";
import { createClient } from "@/lib/supabase/client";
import { haptics } from "@/lib/haptics";
import {
  canSchedule,
  describeWhen,
  fromLocalInput,
  presets,
  toLocalInput,
} from "@/lib/schedule-send";

/**
 * Pick when a typed message should go.
 *
 * Opened by holding Send. The text is already in the composer, so this asks
 * one question and nothing else — three presets for the answers people
 * actually give, and a picker for the rest.
 *
 * It does not clear the composer itself. The caller does that, and only
 * after the row exists, so a failed schedule leaves the words where they
 * were rather than eating them.
 */
export function ScheduleSendSheet({
  open,
  onClose,
  conversationId,
  body,
  replyToId,
  onScheduled,
}: {
  open: boolean;
  onClose: () => void;
  conversationId: string;
  /** Sealed where the device could seal it, exactly as a live send. */
  body: string;
  replyToId: string | null;
  /** Called once the row exists, so the composer can be emptied. */
  onScheduled: () => void;
}) {
  const supabase = createClient();
  const toast = useToast();
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);

  // Read once per render rather than held in state: a sheet open across
  // midnight would otherwise keep offering yesterday's presets.
  const now = new Date();
  const chosen = custom ? fromLocalInput(custom) : null;
  const customProblem = custom ? canSchedule(chosen, now) : null;

  async function schedule(at: Date) {
    if (busy) return;
    const problem = canSchedule(at, new Date());
    if (problem) {
      toast(problem, "error");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("schedule_message", {
      p_conversation_id: conversationId,
      p_body: body,
      p_scheduled_at: at.toISOString(),
      p_reply_to_id: replyToId ?? undefined,
    });
    setBusy(false);
    if (error) {
      // The database says "blocked", "Not a member", "too many" — all of
      // them already read as sentences, so they are shown as they come.
      toast(error.message, "error");
      return;
    }
    haptics.tap();
    toast(`Sending ${describeWhen(at, new Date()).toLowerCase()}`, "success");
    onScheduled();
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Send later">
      <div className="flex flex-col gap-2 pb-2">
        {presets(now).map((p) => (
          <button
            key={p.id}
            type="button"
            disabled={busy}
            onClick={() => void schedule(p.at)}
            className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3 text-left transition active:scale-[0.99] disabled:opacity-50"
          >
            <span className="flex items-center gap-3">
              <Clock size={17} className="text-muted" />
              <span className="text-sm font-semibold text-foreground">{p.label}</span>
            </span>
            <span className="text-xs text-muted">{describeWhen(p.at, now)}</span>
          </button>
        ))}

        <div className="mt-2 flex flex-col gap-2 rounded-2xl bg-surface px-4 py-3">
          <label htmlFor="schedule-at" className="text-xs font-bold uppercase tracking-widest text-faint">
            Pick a time
          </label>
          <input
            id="schedule-at"
            type="datetime-local"
            value={custom}
            min={toLocalInput(new Date(now.getTime() + 60_000))}
            onChange={(e) => setCustom(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
          {customProblem && <p className="text-xs text-danger">{customProblem}</p>}
          <button
            type="button"
            disabled={busy || !chosen || !!customProblem}
            onClick={() => chosen && void schedule(chosen)}
            className="mt-1 flex items-center justify-center gap-2 rounded-pill bg-accent px-4 py-2.5 text-sm font-bold text-accent-ink transition active:scale-95 disabled:opacity-40"
          >
            {busy && <Loader2 size={15} className="animate-spin" />}
            Schedule
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
