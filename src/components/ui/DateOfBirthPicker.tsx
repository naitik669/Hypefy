"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Calendar } from "lucide-react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));

const MIN_YEAR = 1900;

function daysInMonth(year: number, monthIdx: number) {
  return new Date(year, monthIdx + 1, 0).getDate();
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Parse a `yyyy-mm-dd` value without timezone drift. */
function parseValue(v: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!match) return null;
  const y = Number(match[1]), m = Number(match[2]) - 1, d = Number(match[3]);
  if (m < 0 || m > 11 || d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

type Step = "year" | "month" | "day";

/**
 * Brand-styled date-of-birth picker.
 *
 * Replaces `<input type="date">`, whose calendar popup is drawn by the browser
 * and can't be themed, and whose `mm/dd/yyyy` hint renders in the input's text
 * colour rather than as a real placeholder.
 *
 * Year-first rather than a month calendar: entering a birthday means jumping
 * back ~20 years, which a calendar makes tedious.
 */
export function DateOfBirthPicker({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (next: string) => void;
  id?: string;
}) {
  const today = useMemo(() => new Date(), []);
  const maxYear = today.getFullYear();

  const parsed = parseValue(value);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("year");
  const [draftY, setDraftY] = useState<number | null>(parsed?.y ?? null);
  const [draftM, setDraftM] = useState<number | null>(parsed?.m ?? null);

  const rootRef = useRef<HTMLDivElement>(null);
  const yearScrollRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.stopPropagation(); setOpen(false); }
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Bring the relevant year into view when the year list opens.
  useEffect(() => {
    if (!open || step !== "year") return;
    const el = yearScrollRef.current?.querySelector<HTMLElement>("[data-preferred='1']");
    el?.scrollIntoView({ block: "center" });
  }, [open, step]);

  function openPicker() {
    const p = parseValue(value);
    setDraftY(p?.y ?? null);
    setDraftM(p?.m ?? null);
    setStep(p ? "day" : "year");
    setOpen(true);
  }

  function commit(y: number, m: number, d: number) {
    onChange(`${y}-${pad(m + 1)}-${pad(d)}`);
    setOpen(false);
  }

  // Years newest-first: a birth year is far likelier to be recent than 1900.
  const years = useMemo(() => {
    const out: number[] = [];
    for (let y = maxYear; y >= MIN_YEAR; y--) out.push(y);
    return out;
  }, [maxYear]);

  // Default the year list near a plausible birth year rather than the top.
  const preferredYear = parsed?.y ?? maxYear - 20;

  const label = parsed
    ? `${MONTHS[parsed.m]} ${parsed.d}, ${parsed.y}`
    : "Select your date of birth";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        id={id}
        onClick={() => (open ? setOpen(false) : openPicker())}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`flex h-12 w-full items-center justify-between rounded-xl border bg-white/[0.06] px-4 text-left text-sm outline-none transition ${
          open ? "border-white/25" : "border-white/5"
        } ${parsed ? "text-foreground" : "text-faint"}`}
      >
        <span>{label}</span>
        <Calendar size={17} className="shrink-0 text-faint" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choose date of birth"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-2xl border border-border bg-elevated shadow-2xl"
        >
          {/* Header: breadcrumb back through year → month → day */}
          <div className="flex h-11 items-center gap-1 border-b border-border/60 px-2">
            {step !== "year" && (
              <button
                type="button"
                aria-label="Back"
                onClick={() => setStep(step === "day" ? "month" : "year")}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-white/5 hover:text-foreground"
              >
                <ChevronLeft size={18} />
              </button>
            )}
            <p className="px-1.5 text-sm font-bold">
              {step === "year" && "Select year"}
              {step === "month" && draftY}
              {step === "day" && `${draftM !== null ? MONTHS_SHORT[draftM] : ""} ${draftY}`}
            </p>
          </div>

          {step === "year" && (
            <div ref={yearScrollRef} className="max-h-56 overflow-y-auto p-2">
              <div className="grid grid-cols-4 gap-1">
                {years.map((y) => (
                  <button
                    key={y}
                    type="button"
                    data-preferred={y === preferredYear ? "1" : undefined}
                    onClick={() => { setDraftY(y); setStep("month"); }}
                    className={`rounded-lg py-2 text-sm font-semibold tabular-nums transition-colors ${
                      draftY === y
                        ? "bg-accent text-accent-ink"
                        : "text-muted hover:bg-white/5 hover:text-foreground"
                    }`}
                  >
                    {y}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === "month" && draftY !== null && (
            <div className="grid grid-cols-3 gap-1 p-2">
              {MONTHS_SHORT.map((m, i) => {
                // A future month in the current year can't be a birth month.
                const disabled = draftY === maxYear && i > today.getMonth();
                return (
                  <button
                    key={m}
                    type="button"
                    disabled={disabled}
                    onClick={() => { setDraftM(i); setStep("day"); }}
                    className={`rounded-lg py-2.5 text-sm font-semibold transition-colors disabled:opacity-25 ${
                      draftM === i
                        ? "bg-accent text-accent-ink"
                        : "text-muted hover:bg-white/5 hover:text-foreground disabled:hover:bg-transparent"
                    }`}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          )}

          {step === "day" && draftY !== null && draftM !== null && (
            <div className="grid grid-cols-7 gap-1 p-2">
              {Array.from({ length: daysInMonth(draftY, draftM) }, (_, i) => i + 1).map((d) => {
                const disabled =
                  draftY === maxYear &&
                  draftM === today.getMonth() &&
                  d > today.getDate();
                const selected = parsed?.y === draftY && parsed?.m === draftM && parsed?.d === d;
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={disabled}
                    onClick={() => commit(draftY, draftM, d)}
                    className={`aspect-square rounded-lg text-sm font-semibold tabular-nums transition-colors disabled:opacity-25 ${
                      selected
                        ? "bg-accent text-accent-ink"
                        : "text-muted hover:bg-white/5 hover:text-foreground disabled:hover:bg-transparent"
                    }`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
