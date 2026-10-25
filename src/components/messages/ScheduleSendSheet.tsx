"use client";

import { useState } from "react";
import { CalendarDays, ChevronLeft, Loader2 } from "lucide-react";
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
  describeParts,
  describeWhen,
  openingChoice,
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
 * Opened by holding Send. The sheet shows one time — the answer, at the size
 * of an answer — and three chips plus a calendar button that move it. It is
 * not a menu of four things to read: whatever you touch, the headline is what
 * will happen and the button under it does that.
 *
 * It replaced a list of four near-identical rows. Those repeated a clock icon
 * three times, put the times themselves in muted 11px off to the right, and
 * ended in an outlined button that read as disabled rather than as the fourth
 * option. Nothing in it was louder than anything else.
 *
 * Anything the chips do not cover is three drums for the date and three for
 * the clock, the same wheel the birthday picker uses, so the gesture is one
 * the reader has already met. They set that same headline and come back to
 * it: there is one place this sends from.
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

  // One reading of the clock seeds all four, so they cannot end up
  // describing different moments across a millisecond boundary at mount.
  const [seed] = useState(() => openingChoice(new Date()));
  const [offset, setOffset] = useState(seed.offset);
  const [hour, setHour] = useState(seed.hour);
  const [minute, setMinute] = useState(seed.minute);
  /** Which chip is lit, or null once the drums have been touched. */
  const [presetId, setPresetId] = useState<string | null>(seed.presetId);

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
    setPresetId(null);
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

  /** The chosen time is now this time, so no chip may go on claiming it. */
  function pickMinute(next: number) {
    setPresetId(null);
    setMinute(next);
  }

  function pickHour12(next: number) {
    const fixed = clampWithinMeridiem(day, next, meridiem, minute, now);
    if (!fixed) return;
    setPresetId(null);
    setHour(fixed.hour);
    setMinute(fixed.minute);
  }

  /** Staying in the half just chosen, rather than falling back across it. */
  function pickMeridiem(next: number) {
    const to: Meridiem = next === AM ? "AM" : "PM";
    const fixed = clampWithinMeridiem(day, hour12, to, minute, now);
    if (!fixed) return;
    setPresetId(null);
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

  /**
   * Put an offset into the chosen time.
   *
   * It does not send. The offsets used to send on tap, which made the chips
   * and the drums two different kinds of control wearing the same clothes,
   * and left nothing on screen saying what the tap had just committed to.
   */
  function pickPreset(id: string, at: Date) {
    setPresetId(id);
    setOffset(offsetOfDate(at.getFullYear(), at.getMonth(), at.getDate(), now));
    setHour(at.getHours());
    setMinute(at.getMinutes());
  }

  const when = describeParts(chosen, now);
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
        <div className="flex flex-col gap-4 pb-2">
          {/* The answer, at the size of an answer. Two lines because the day
              and the clock are read at different distances — but one sentence
              to a screen reader, which has no sizes and would otherwise be
              handed two unlabelled fragments. */}
          <div>
            <span className="sr-only" aria-live="polite">
              {problem ?? `Sending ${describeWhen(chosen, now).toLowerCase()}`}
            </span>
            <p aria-hidden className="text-[27px] font-bold leading-tight tracking-tight text-foreground">
              {when.day}
            </p>
            <p aria-hidden className="text-lg font-bold tabular-nums text-accent">{when.time}</p>
          </div>

          {/* The offsets are absolute, not cumulative: tapping one is a choice
              another tap takes back. "+1 day" would read as stacking, and
              stacking has no way back from inside the sheet. */}
          <div className="flex gap-1.5">
            {presets(now).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => pickPreset(p.id, p.at)}
                aria-pressed={presetId === p.id}
                aria-label={p.label}
                className={`flex-1 rounded-xl py-2.5 text-xs font-semibold transition active:scale-[0.97] ${
                  presetId === p.id ? "bg-white/15 text-foreground" : "bg-white/5 text-muted"
                }`}
              >
                {p.short}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setStep("date")}
              aria-label="Pick a date and time"
              className="flex w-11 items-center justify-center rounded-xl bg-white/5 text-muted transition-colors hover:text-foreground"
            >
              <CalendarDays size={16} />
            </button>
          </div>

          <button
            type="button"
            disabled={busy || problem !== null}
            onClick={() => void schedule(chosen)}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-bold text-accent-ink transition active:scale-[0.99] disabled:opacity-40"
          >
            {busy && <Loader2 size={15} className="animate-spin" />}
            {problem ?? "Schedule"}
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
            <WheelColumn options={minutes} value={minute} onChange={pickMinute} ariaLabel="Minute" />
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
            disabled={problem !== null}
            onClick={() => setStep("presets")}
            className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-bold text-accent-ink transition active:scale-[0.99] disabled:opacity-40"
          >
            {problem ?? "Done"}
          </button>
        </div>
      )}
    </BottomSheet>
  );
}
