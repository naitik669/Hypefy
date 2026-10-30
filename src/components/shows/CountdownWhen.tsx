"use client";

import { useState } from "react";
import { CalendarDays, ChevronLeft } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { WheelColumn, WheelFrame } from "@/components/ui/Wheel";
import {
  AM,
  PM,
  canSchedule,
  clampDate,
  clampTime,
  clampWithinMeridiem,
  dayFromOffset,
  dayNumOptions,
  dayOptions,
  describeParts,
  hour12Options,
  meridiemOptions,
  minuteOptions,
  monthOptions,
  offsetOfDate,
  presets,
  to12h,
  withTime,
  yearOptions,
  type Meridiem,
} from "@/lib/schedule-send";

/**
 * When a countdown ends, picked the way a message is scheduled.
 *
 * The same sheet in all but its last word: the answer at the size of an
 * answer, three offsets and a calendar button that move it, and the date
 * and the clock as the drums the scheduler and the birthday picker use —
 * the shape of picking a time people have already met in this app. The
 * bounds are the scheduler's too, so a countdown can run up to ninety days.
 */
export function CountdownWhen({
  open,
  at,
  onClose,
  onPick,
}: {
  open: boolean;
  /** Where it ends now. */
  at: string;
  onClose: () => void;
  onPick: (at: Date) => void;
}) {
  const [step, setStep] = useState<"presets" | "date" | "time">("presets");
  const [seed] = useState(() => {
    const now = new Date();
    const from = new Date(at);
    const start = Number.isNaN(from.getTime()) || canSchedule(from, now) ? presets(now)[1]?.at ?? now : from;
    return {
      offset: offsetOfDate(start.getFullYear(), start.getMonth(), start.getDate(), now),
      hour: start.getHours(),
      minute: start.getMinutes() - (start.getMinutes() % 5),
    };
  });
  const [offset, setOffset] = useState(seed.offset);
  const [hour, setHour] = useState(seed.hour);
  const [minute, setMinute] = useState(seed.minute);
  const [presetId, setPresetId] = useState<string | null>(null);

  const now = new Date();
  const day = dayFromOffset(offset, now);
  const { hour12, meridiem } = to12h(hour);
  const chosen = withTime(day, hour, minute);
  const problem = canSchedule(chosen, now);
  const when = describeParts(chosen, now);
  const dayLabel = dayOptions(now).find((d) => d.value === offset)?.label ?? "";
  const picked = dayFromOffset(offset, now);
  const [pYear, pMonth, pDay] = [picked.getFullYear(), picked.getMonth(), picked.getDate()];

  function pickDay(next: number) {
    setPresetId(null);
    setOffset(next);
    const fixed = clampTime(dayFromOffset(next, now), hour, minute, now);
    setHour(fixed.hour);
    setMinute(fixed.minute);
  }

  function setDatePart(part: "year" | "month" | "day", value: number) {
    const next = clampDate(
      part === "year" ? value : pYear,
      part === "month" ? value : pMonth,
      part === "day" ? value : pDay,
      now,
    );
    pickDay(offsetOfDate(next.year, next.month, next.dayNum, now));
  }

  function pickHour12(next: number) {
    const fixed = clampWithinMeridiem(day, next, meridiem, minute, now);
    if (!fixed) return;
    setPresetId(null);
    setHour(fixed.hour);
    setMinute(fixed.minute);
  }

  function pickMeridiem(next: number) {
    const to: Meridiem = next === AM ? "AM" : "PM";
    const fixed = clampWithinMeridiem(day, hour12, to, minute, now);
    if (!fixed) return;
    setPresetId(null);
    setHour(fixed.hour);
    setMinute(fixed.minute);
  }

  function pickPreset(id: string, at: Date) {
    setPresetId(id);
    setOffset(offsetOfDate(at.getFullYear(), at.getMonth(), at.getDate(), now));
    setHour(at.getHours());
    setMinute(at.getMinutes());
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={step === "presets" ? "When it ends" : undefined}>
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
          <span className="text-sm font-bold text-foreground">{step === "date" ? "Pick a date" : dayLabel}</span>
        </div>
      )}

      {step === "presets" && (
        <div className="flex flex-col gap-4 pb-2">
          <div>
            <span className="sr-only" aria-live="polite">
              {problem ?? `Ends ${when.day}, ${when.time}`}
            </span>
            <p aria-hidden className="text-[27px] font-bold leading-tight tracking-tight text-foreground">
              {when.day}
            </p>
            <p aria-hidden className="text-lg font-bold tabular-nums text-accent">
              {when.time}
            </p>
          </div>
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
            disabled={problem !== null}
            onClick={() => {
              onPick(chosen);
              onClose();
            }}
            className="flex h-12 w-full items-center justify-center rounded-xl bg-accent text-sm font-bold text-accent-ink transition active:scale-[0.99] disabled:opacity-40"
          >
            {problem ?? "Set countdown"}
          </button>
        </div>
      )}

      {step === "date" && (
        <div className="pb-2">
          <WheelFrame>
            <WheelColumn options={dayNumOptions(pYear, pMonth, now)} value={pDay} onChange={(v) => setDatePart("day", v)} ariaLabel="Date" align="right" />
            <WheelColumn options={monthOptions(pYear, now)} value={pMonth} onChange={(v) => setDatePart("month", v)} ariaLabel="Month" />
            <WheelColumn options={yearOptions(now)} value={pYear} onChange={(v) => setDatePart("year", v)} ariaLabel="Year" align="left" />
          </WheelFrame>
          <button
            type="button"
            onClick={() => {
              const fixed = clampTime(day, hour, minute, now);
              setHour(fixed.hour);
              setMinute(fixed.minute);
              setStep("time");
            }}
            className="mt-4 flex h-12 w-full items-center justify-center rounded-xl bg-accent text-sm font-bold text-accent-ink transition active:scale-[0.99]"
          >
            Next
          </button>
        </div>
      )}

      {step === "time" && (
        <div className="pb-2">
          <WheelFrame>
            <WheelColumn options={hour12Options(day, meridiem, now)} value={hour12} onChange={pickHour12} ariaLabel="Hour" align="right" />
            <WheelColumn
              options={minuteOptions(day, hour, now)}
              value={minute}
              onChange={(v) => {
                setPresetId(null);
                setMinute(v);
              }}
              ariaLabel="Minute"
            />
            <WheelColumn options={meridiemOptions(day, now)} value={meridiem === "AM" ? AM : PM} onChange={pickMeridiem} ariaLabel="AM or PM" align="left" />
          </WheelFrame>
          <button
            type="button"
            disabled={problem !== null}
            onClick={() => setStep("presets")}
            className="mt-4 flex h-12 w-full items-center justify-center rounded-xl bg-accent text-sm font-bold text-accent-ink transition active:scale-[0.99] disabled:opacity-40"
          >
            {problem ?? "Done"}
          </button>
        </div>
      )}
    </BottomSheet>
  );
}
