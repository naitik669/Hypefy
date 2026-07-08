"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BottomSheet } from "@/components/ui/BottomSheet";

export const REPORT_REASONS = [
  "Spam",
  "Harassment or bullying",
  "Hate or abuse",
  "Scam or fraud",
  "Nudity or sexual content",
  "Violence or dangerous acts",
  "Misinformation",
  "Other",
];

// Must stay in sync with the reports.target_type check constraint.
export type ReportTarget = "post" | "shot" | "comment" | "message" | "profile" | "conversation";

const LABELS: Record<ReportTarget, string> = {
  post: "post",
  shot: "Shot",
  comment: "comment",
  message: "message",
  profile: "account",
  conversation: "group",
};

/**
 * Reusable report flow. Asks for a reason (and optional details),
 * then writes a row to `public.reports`. De-duplicated per user/target.
 */
export function ReportSheet({
  open,
  onClose,
  targetType,
  targetId,
  currentUserId,
  onReported,
}: {
  open: boolean;
  onClose: () => void;
  targetType: ReportTarget;
  targetId: string;
  currentUserId: string;
  onReported?: () => void;
}) {
  const supabase = createClient();
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  function reset() {
    setReason(null);
    setDetails("");
    setSubmitting(false);
    setDone(false);
  }

  async function submit() {
    if (!reason || submitting) return;
    setSubmitting(true);
    const { error } = await supabase.from("reports").insert({
      reporter_id: currentUserId,
      target_type: targetType,
      target_id: targetId,
      reason,
      details: details.trim() || null,
      status: "pending",
    });
    setSubmitting(false);
    // 23505 = unique violation → already reported. Treat as success.
    if (error && error.code !== "23505") {
      setReason(null);
      return;
    }
    setDone(true);
    onReported?.();
    setTimeout(() => { onClose(); reset(); }, 1100);
  }

  return (
    <BottomSheet open={open} onClose={() => { onClose(); reset(); }} title={`Report ${LABELS[targetType]}`}>
      {done ? (
        <div className="flex flex-col items-center gap-2 py-8">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
            <Check size={26} />
          </span>
          <p className="text-sm font-semibold">Thanks for reporting</p>
          <p className="text-center text-xs text-muted">Our team will review this {LABELS[targetType]}.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1 pb-3">
          <p className="pb-1 text-xs text-muted">Why are you reporting this {LABELS[targetType]}?</p>
          {REPORT_REASONS.map((rr) => (
            <button
              key={rr}
              type="button"
              onClick={() => setReason(rr)}
              className={`flex items-center justify-between rounded-xl px-3 py-3 text-left text-sm transition-colors ${
                reason === rr ? "bg-accent/10 text-foreground" : "hover:bg-white/5"
              }`}
            >
              {rr}
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                  reason === rr ? "border-accent bg-accent text-accent-ink" : "border-border text-transparent"
                }`}
              >
                <Check size={13} />
              </span>
            </button>
          ))}

          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Add details (optional)"
            rows={2}
            className="mt-2 w-full resize-none rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none placeholder:text-faint focus:border-white/25"
          />

          <button
            type="button"
            onClick={submit}
            disabled={!reason || submitting}
            className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-bold text-accent-ink transition-transform active:scale-[0.99] disabled:opacity-50"
          >
            {submitting ? <><Loader2 size={16} className="animate-spin" /> Submitting…</> : "Submit report"}
          </button>
        </div>
      )}
    </BottomSheet>
  );
}
