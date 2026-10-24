"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Clock, Loader2 } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { useToast } from "@/components/ui/ToastProvider";
import { createClient } from "@/lib/supabase/client";
import { haptics } from "@/lib/haptics";
import {
  addMonths,
  canSchedule,
  describeWhen,
  hourOptions,
  minuteOptions,
  monthGrid,
  monthInRange,
  monthLabel,
  presets,
  sameDay,
  startOfDay,
  withTime,
} from "@/lib/schedule-send";

/** Monday first, matching the grid. Two letters so seven fit across a phone. */
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

type Step = "presets" | "date" | "time";

/**
 * Pick when a typed message should go.
 *
 * Opened by holding Send. Three offsets cover most of it; the rest is a
 * calendar and then a clock, in that order, because a date is the coarser
 * decision and choosing it narrows which times are even offered. Each step
 * can be walked back — the arrow in the header returns to the one before
 * rather than closing the sheet and losing the typing.
 *
 * It does not clear the composer. The caller does, and only once the row
 * exists, so a failed schedule leaves the words where they were.
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
  const [step, setStep] = useState<Step>("presets");
  const [month, setMonth] = useState(() => startOfDay(new Date()));
  const [day, setDay] = useState<Date | null>(null);
  const [hour, setHour] = useState<number | null>(null);
  const [minute, setMinute] = useState<number>(0);
  const [busy, setBusy] = useState(false);

  // Read per render rather than held in state, so a sheet left open across
  // midnight does not keep offering yesterday.
  const now = new Date();
  const chosen = day && hour !== null ? withTime(day, hour, minute) : null;

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
      // "blocked", "Not a member", "too many" all already read as sentences.
      toast(error.message, "error");
      return;
    }
    haptics.tap();
    toast(`Sending ${describeWhen(at, new Date()).toLowerCase()}`, "success");
    onScheduled();
    onClose();
  }

  function pickDay(d: Date) {
    haptics.select();
    setDay(d);
    // The first hour still ahead, so the clock opens somewhere usable
    // rather than on a row of dead buttons.
    const firstFree = hourOptions(d, now).find((h) => !h.disabled);
    setHour(null);
    setMinute(minuteOptions(d, firstFree?.hour ?? 0, now).find((m) => !m.disabled)?.minute ?? 0);
    setStep("time");
  }

  const back =
    step === "date" ? () => setStep("presets") : step === "time" ? () => setStep("date") : null;

  return (
    <BottomSheet open={open} onClose={onClose} title={step === "presets" ? "Send later" : undefined}>
      {back && (
        <div className="mb-2 flex items-center gap-2">
          <button
            type="button"
            onClick={back}
            aria-label={step === "time" ? "Back to the date" : "Back"}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-white/5 hover:text-foreground"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-bold text-foreground">
            {step === "date"
              ? "Pick a date"
              : day
                ? day.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })
                : "Pick a time"}
          </span>
        </div>
      )}

      {step === "presets" && (
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
          <button
            type="button"
            onClick={() => setStep("date")}
            className="mt-1 rounded-2xl border border-border px-4 py-3 text-sm font-semibold text-muted transition-colors hover:text-foreground"
          >
            Pick a date and time
          </button>
        </div>
      )}

      {step === "date" && (
        <div className="flex flex-col gap-3 pb-2">
          <div className="flex items-center justify-between">
            <button
              type="button"
              disabled={!monthInRange(addMonths(month, -1), now)}
              onClick={() => setMonth((m) => addMonths(m, -1))}
              aria-label="Previous month"
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-white/5 hover:text-foreground disabled:opacity-25"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm font-bold text-foreground">{monthLabel(month)}</span>
            <button
              type="button"
              disabled={!monthInRange(addMonths(month, 1), now)}
              onClick={() => setMonth((m) => addMonths(m, 1))}
              aria-label="Next month"
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-white/5 hover:text-foreground disabled:opacity-25"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map((d) => (
              <span key={d} className="py-1 text-center text-[11px] font-bold uppercase text-faint">
                {d}
              </span>
            ))}
            {monthGrid(month, now).map((cell) => {
              const picked = day && sameDay(cell.date, day);
              return (
                <button
                  key={cell.date.toISOString()}
                  type="button"
                  disabled={cell.disabled}
                  onClick={() => pickDay(cell.date)}
                  aria-label={cell.date.toLocaleDateString(undefined, {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}
                  aria-current={cell.today ? "date" : undefined}
                  className={`aspect-square rounded-xl text-sm font-semibold transition active:scale-95 disabled:opacity-20 ${
                    picked
                      ? "bg-accent text-accent-ink"
                      : cell.today
                        ? "bg-surface text-accent ring-1 ring-accent/40"
                        : cell.inMonth
                          ? "bg-surface text-foreground hover:bg-elevated"
                          : "text-faint"
                  }`}
                >
                  {cell.date.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {step === "time" && day && (
        <div className="flex flex-col gap-3 pb-2">
          <div className="grid grid-cols-6 gap-1">
            {hourOptions(day, now).map((h) => (
              <button
                key={h.hour}
                type="button"
                disabled={h.disabled}
                onClick={() => {
                  setHour(h.hour);
                  // Keep the chosen minute only if it is still ahead.
                  const free = minuteOptions(day, h.hour, now).filter((m) => !m.disabled);
                  if (!free.some((m) => m.minute === minute)) setMinute(free[0]?.minute ?? 0);
                }}
                className={`rounded-lg py-2 text-sm font-semibold tabular-nums transition active:scale-95 disabled:opacity-20 ${
                  hour === h.hour ? "bg-accent text-accent-ink" : "bg-surface text-foreground hover:bg-elevated"
                }`}
              >
                {String(h.hour).padStart(2, "0")}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            {minuteOptions(day, hour ?? 0, now).map((m) => (
              <button
                key={m.minute}
                type="button"
                disabled={hour === null || m.disabled}
                onClick={() => setMinute(m.minute)}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold tabular-nums transition active:scale-95 disabled:opacity-20 ${
                  hour !== null && minute === m.minute
                    ? "bg-accent text-accent-ink"
                    : "bg-surface text-foreground hover:bg-elevated"
                }`}
              >
                :{String(m.minute).padStart(2, "0")}
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={busy || !chosen || canSchedule(chosen, now) !== null}
            onClick={() => chosen && void schedule(chosen)}
            className="mt-1 flex items-center justify-center gap-2 rounded-pill bg-accent px-4 py-3 text-sm font-bold text-accent-ink transition active:scale-95 disabled:opacity-40"
          >
            {busy && <Loader2 size={15} className="animate-spin" />}
            {chosen ? `Send ${describeWhen(chosen, now).toLowerCase()}` : "Pick a time"}
          </button>
        </div>
      )}
    </BottomSheet>
  );
}
