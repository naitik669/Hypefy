"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Rows of the time drums. */
const ITEM_H = 40;
const VISIBLE = 3;
const PAD = ((VISIBLE - 1) / 2) * ITEM_H;

const pad2 = (n: number) => String(n).padStart(2, "0");
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** "2026-08-30T14:19" — the format the composer already stores. */
function toLocalValue(day: Date, hour24: number, minute: number): string {
  return `${day.getFullYear()}-${pad2(day.getMonth() + 1)}-${pad2(day.getDate())}T${pad2(hour24)}:${pad2(minute)}`;
}

function parseLocalValue(v: string | null): Date | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
}

/**
 * One scrolling column of the time picker. The row under the centre band is
 * the value, so scrolling and tapping are the same gesture — the same model
 * the date-of-birth wheel uses.
 */
function Drum({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: number; label: string }[];
  value: number;
  onChange: (v: number) => void;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const committed = useRef(index);

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = index * ITEM_H;
    committed.current = index;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-align only when the value changed from outside, never for our own
  // scroll — otherwise the column feeds back on itself and walks away.
  useEffect(() => {
    if (index === committed.current) return;
    const el = ref.current;
    if (el) el.scrollTop = index * ITEM_H;
    committed.current = index;
  }, [index]);

  function onScroll() {
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const i = Math.max(0, Math.min(options.length - 1, Math.round(el.scrollTop / ITEM_H)));
      if (i === committed.current) return;
      committed.current = i;
      onChange(options[i].value);
    }, 100);
  }

  return (
    <div
      ref={ref}
      role="listbox"
      aria-label={ariaLabel}
      tabIndex={0}
      onScroll={onScroll}
      className="no-scrollbar flex-1 snap-y snap-mandatory overflow-y-auto outline-none focus-visible:ring-1 focus-visible:ring-accent/50"
      style={{ height: VISIBLE * ITEM_H }}
    >
      <div style={{ height: PAD }} aria-hidden />
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          role="option"
          aria-selected={i === index}
          tabIndex={-1}
          onClick={() => {
            committed.current = i;
            ref.current?.scrollTo({ top: i * ITEM_H, behavior: "smooth" });
            onChange(o.value);
          }}
          style={{ height: ITEM_H }}
          className={`flex w-full snap-center items-center justify-center tabular-nums transition-colors ${
            i === index ? "text-[17px] font-extrabold text-foreground" : "text-[15px] font-semibold text-faint"
          }`}
        >
          {o.label}
        </button>
      ))}
      <div style={{ height: PAD }} aria-hidden />
    </div>
  );
}

/**
 * Themed date + time picker for scheduling a post.
 *
 * Replaces `<input type="datetime-local">`, whose popup is drawn by the
 * browser: it cannot be themed, ignores the app's dark palette entirely, and
 * looks like a system dialog dropped into the page.
 *
 * A calendar grid for the date (scheduling is "next Tuesday", so the weekday
 * matters and a grid shows it) and drums for the time.
 */
export function SchedulePicker({
  open,
  value,
  onClose,
  onConfirm,
}: {
  open: boolean;
  value: string | null;
  onClose: () => void;
  onConfirm: (next: string) => void;
}) {
  /** Seeded from the saved value each time the sheet opens, so reopening
   *  shows what was chosen rather than whatever the last visit left behind.
   *
   *  Re-seeding during render on the open→true edge, rather than in an
   *  effect: an effect would paint one frame of the previous values first.
   *  `openedAt` is captured here too, so "is this in the past" compares
   *  against a fixed instant instead of calling Date.now() while rendering. */
  const seedFrom = (v: string | null) => {
    const d = parseLocalValue(v) ?? new Date(Date.now() + 60 * 60 * 1000);
    return {
      open: true,
      openedAt: Date.now(),
      day: startOfDay(d),
      hour24: d.getHours(),
      minute: (Math.round(d.getMinutes() / 5) * 5) % 60,
      viewMonth: new Date(d.getFullYear(), d.getMonth(), 1),
    };
  };

  const [s, setS] = useState(() => seedFrom(value));
  if (open && !s.open) setS(seedFrom(value));
  if (!open && s.open) setS((p) => ({ ...p, open: false }));

  const { day, hour24, minute, viewMonth, openedAt } = s;
  const setDay = (d: Date) => setS((p) => ({ ...p, day: d }));
  const setHour24 = (h: number) => setS((p) => ({ ...p, hour24: h }));
  const setMinute = (m: number) => setS((p) => ({ ...p, minute: m }));
  const setViewMonth = (fn: (m: Date) => Date) => setS((p) => ({ ...p, viewMonth: fn(p.viewMonth) }));

  const today = useMemo(() => startOfDay(new Date(openedAt)), [openedAt]);

  const grid = useMemo(() => {
    const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
    const lead = first.getDay();
    const cells: (Date | null)[] = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d));
    }
    return cells;
  }, [viewMonth]);

  const hours = useMemo(
    () => Array.from({ length: 12 }, (_, i) => ({ value: i === 0 ? 12 : i, label: String(i === 0 ? 12 : i) })),
    [],
  );
  const minutes = useMemo(
    () => Array.from({ length: 12 }, (_, i) => ({ value: i * 5, label: pad2(i * 5) })),
    [],
  );

  const isPm = hour24 >= 12;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const setHour12 = (h: number) => setHour24((h % 12) + (isPm ? 12 : 0));
  const setMeridiem = (pm: boolean) => setHour24((hour24 % 12) + (pm ? 12 : 0));

  const chosen = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour24, minute);
  // A schedule in the past would publish on the very next cron tick, which is
  // indistinguishable from posting now — so it is refused rather than silently
  // accepted. Compared against the instant the sheet opened; the composer
  // re-checks against real time on submit anyway (`willSchedule`).
  const inPast = chosen.getTime() <= openedAt;

  // Never let the month view walk back past the current month; nothing there
  // is selectable.
  const canGoPrev = viewMonth > new Date(today.getFullYear(), today.getMonth(), 1);

  return (
    <BottomSheet open={open} onClose={onClose} title="Schedule">
      <div className="flex flex-col gap-4 pb-2">
        {/* Month nav */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            disabled={!canGoPrev}
            onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
            aria-label="Previous month"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors enabled:hover:bg-white/5 enabled:hover:text-foreground disabled:opacity-25"
          >
            <ChevronLeft size={18} />
          </button>
          <p className="text-sm font-bold">
            {MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
          </p>
          <button
            type="button"
            onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
            aria-label="Next month"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-white/5 hover:text-foreground"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Calendar */}
        <div>
          <div className="grid grid-cols-7 pb-1">
            {WEEKDAYS.map((w) => (
              <span key={w} className="text-center text-[10px] font-bold uppercase tracking-wider text-faint">
                {w}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-1">
            {grid.map((d, i) => {
              if (!d) return <span key={`b${i}`} />;
              const past = d < today;
              const selected = sameDay(d, day);
              const isToday = sameDay(d, today);
              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  disabled={past}
                  onClick={() => setDay(d)}
                  aria-pressed={selected}
                  className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full text-[13px] tabular-nums transition-colors ${
                    selected
                      ? "bg-accent font-extrabold text-accent-ink"
                      : past
                        ? "text-faint/35"
                        : isToday
                          ? "font-bold text-accent hover:bg-white/5"
                          : "font-semibold text-foreground hover:bg-white/5"
                  }`}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
        </div>

        {/* Time */}
        <div className="relative rounded-xl border border-border bg-surface px-2">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-2 top-1/2 -translate-y-1/2 rounded-lg bg-accent/10"
            style={{ height: ITEM_H }}
          />
          <div className="flex items-center">
            <Drum options={hours} value={hour12} onChange={setHour12} ariaLabel="Hour" />
            <span className="px-0.5 text-[17px] font-extrabold text-muted">:</span>
            <Drum options={minutes} value={minute} onChange={setMinute} ariaLabel="Minute" />
            <div className="flex flex-1 flex-col gap-1 py-2 pl-2">
              {[false, true].map((pm) => (
                <button
                  key={String(pm)}
                  type="button"
                  onClick={() => setMeridiem(pm)}
                  className={`rounded-lg py-1 text-xs font-bold transition-colors ${
                    isPm === pm ? "bg-accent text-accent-ink" : "text-muted hover:text-foreground"
                  }`}
                >
                  {pm ? "PM" : "AM"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {inPast && (
          <p className="text-xs text-danger">That time has passed — pick a later one.</p>
        )}

        <button
          type="button"
          disabled={inPast}
          onClick={() => { onConfirm(toLocalValue(day, hour24, minute)); onClose(); }}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-bold text-accent-ink transition-transform active:scale-[0.99] disabled:opacity-40"
        >
          <Check size={16} />
          Schedule for {chosen.toLocaleString(undefined, {
            weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
          })}
        </button>
      </div>
    </BottomSheet>
  );
}
