"use client";

import { useState } from "react";
import { ChevronLeft, Clock, Loader2 } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { WheelColumn, WheelFrame } from "@/components/ui/Wheel";
import { useToast } from "@/components/ui/ToastProvider";
import { createClient } from "@/lib/supabase/client";
import { haptics } from "@/lib/haptics";
import {
  AM,
  PM,
  canSchedule,
  clampDate,
  dayNumOptions,
  monthOptions,
  offsetOfDate,
  yearOptions,
  clampTime,
  clampWithinMeridiem,
  dayFromOffset,
  dayOptions,
  describeWhen,
  hour12Options,
  meridiemOptions,
  minuteOptions,
  presets,
  to12h,
  withTime,
  type Meridiem,
} from "@/lib/schedule-send";

/**
 * Pick when a typed message should go.
 *
 * Opened by holding Send. Three offsets cover most of it; anything else is
 * three drums — day, hour, minute — which is the same wheel the birthday
 * picker uses, so the gesture is one the reader has already met.
 *
 * It replaced a month grid and two rows of buttons. The grid was accurate
 * and fiddly: a date and a time took a tap on a cell, then a tap on an hour,
 * then a tap on a quarter, with the hours redrawing underneath. The drums
 * take one gesture each and never redraw under the finger.
 *
 * Days that cannot be picked are left out of the drum rather than greyed.
 * The row under the band IS the value, so an unpickable row under the band
 * would be a contradiction — there is nowhere to put "no" on a wheel.
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
  const [step, setStep] = useState<"presets" | "date" | "time">("presets");
  const [busy, setBusy] = useState(false);

  // Opened on the first hour still ahead, so the drums start somewhere
  // usable rather than on a time that has gone.
  // The first day still open, which late at night is tomorrow — dayOptions
  // drops a day with nothing left on it, so index dayOptions(new Date())[0]?.value ?? 0 is always real.
  const [offset, setOffset] = useState(() => 0);
  const [hour, setHour] = useState(12);
  const [minute, setMinute] = useState(0);

  // Read per render rather than held: a sheet left open across midnight
  // would otherwise keep offering yesterday.
  const now = new Date();
  const day = dayFromOffset(offset, now);
  // The 24-hour value stays the single source of truth; the drums are a
  // reading of it. Deriving rather than storing hour12 and the meridiem
  // separately is what stops the three of them disagreeing.
  const { hour12, meridiem } = to12h(hour);
  const meridiems = meridiemOptions(day, now);
  const hours12 = hour12Options(day, meridiem, now);
  const minutes = minuteOptions(day, hour, now);
  const chosen = withTime(day, hour, minute);
  const problem = canSchedule(chosen, now);

  /** Moving the day can strand the clock in a time that has already gone. */
  function pickDay(next: number) {
    setOffset(next);
    const fixed = clampTime(dayFromOffset(next, now), hour, minute, now);
    setHour(fixed.hour);
    setMinute(fixed.minute);
  }

  /**
   * Open the clock on the chosen day.
   *
   * The time is settled here rather than carried from whatever the drums
   * last showed, because the day has just changed underneath it: picking
   * tomorrow after looking at today must not land on an hour that only made
   * sense yesterday.
   */
  function openClock() {
    const fixed = clampTime(day, hour, minute, now);
    setHour(fixed.hour);
    setMinute(fixed.minute);
    setStep("time");
  }

  function pickHour12(next: number) {
    const fixed = clampWithinMeridiem(day, next, meridiem, minute, now);
    if (!fixed) return;
    setHour(fixed.hour);
    setMinute(fixed.minute);
  }

  /** Staying in the half just chosen, rather than falling back across it. */
  function pickMeridiem(next: number) {
    const to: Meridiem = next === AM ? "AM" : "PM";
    const fixed = clampWithinMeridiem(day, hour12, to, minute, now);
    if (!fixed) return;
    setHour(fixed.hour);
    setMinute(fixed.minute);
  }

  async function schedule(at: Date) {
    if (busy) return;
    const why = canSchedule(at, new Date());
    if (why) {
      toast(why, "error");
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

  const dayLabel = dayOptions(now).find((d) => d.value === offset)?.label ?? "";

  // The three date drums read off the chosen day rather than holding state
  // of their own, so they cannot drift apart from it or from each other.
  const picked = dayFromOffset(offset, now);
  const [pYear, pMonth, pDay] = [picked.getFullYear(), picked.getMonth(), picked.getDate()];

  /** Move one part of the date, and let the other two settle around it. */
  function setDatePart(part: "year" | "month" | "day", value: number) {
    const next = clampDate(
      part === "year" ? value : pYear,
      part === "month" ? value : pMonth,
      part === "day" ? value : pDay,
      now,
    );
    pickDay(offsetOfDate(next.year, next.month, next.dayNum, now));
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={step === "presets" ? "Send later" : undefined}>
      {step !== "presets" && (
        <div className="mb-1 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setStep(step === "time" ? "date" : "presets")}
            aria-label={step === "time" ? "Back to the date" : "Back"}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-white/5 hover:text-foreground"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-bold text-foreground">
            {step === "date" ? "Pick a date" : dayLabel}
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

      {/* One drum on its own, full width. Four columns at once made the day
          — the thing most people are actually choosing — a narrow strip. */}
      {step === "date" && (
        <div className="pb-2">
          <WheelFrame>
            <WheelColumn
              options={dayNumOptions(pYear, pMonth, now)}
              value={pDay}
              onChange={(v) => setDatePart("day", v)}
              ariaLabel="Date"
              align="right"
            />
            <WheelColumn
              options={monthOptions(pYear, now)}
              value={pMonth}
              onChange={(v) => setDatePart("month", v)}
              ariaLabel="Month"
            />
            <WheelColumn
              options={yearOptions(now)}
              value={pYear}
              onChange={(v) => setDatePart("year", v)}
              ariaLabel="Year"
              align="left"
            />
          </WheelFrame>
          <button
            type="button"
            onClick={openClock}
            className="mt-4 flex h-12 w-full items-center justify-center rounded-xl bg-accent text-sm font-bold text-accent-ink transition active:scale-[0.99]"
          >
            Next
          </button>
        </div>
      )}

      {step === "time" && (
        <div className="pb-2">
          <WheelFrame>
            <WheelColumn options={hours12} value={hour12} onChange={pickHour12} ariaLabel="Hour" align="right" />
            <WheelColumn options={minutes} value={minute} onChange={setMinute} ariaLabel="Minute" />
            <WheelColumn
              options={meridiems}
              value={meridiem === "AM" ? AM : PM}
              onChange={pickMeridiem}
              ariaLabel="AM or PM"
              align="left"
            />
          </WheelFrame>

          <button
            type="button"
            disabled={busy || problem !== null}
            onClick={() => void schedule(chosen)}
            className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-bold text-accent-ink transition active:scale-[0.99] disabled:opacity-40"
          >
            {busy && <Loader2 size={15} className="animate-spin" />}
            {problem ?? `Send ${describeWhen(chosen, now).toLowerCase()}`}
          </button>
        </div>
      )}
    </BottomSheet>
  );
}
