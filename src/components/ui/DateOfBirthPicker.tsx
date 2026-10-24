"use client";

import { useEffect, useMemo, useState } from "react";
import { Cake } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { WheelColumn, WheelFrame, type WheelOption } from "@/components/ui/Wheel";

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MIN_YEAR = 1900;

const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
const pad2 = (n: number) => String(n).padStart(2, "0");

function parseValue(v: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!match) return null;
  const y = Number(match[1]), m = Number(match[2]) - 1, d = Number(match[3]);
  if (m < 0 || m > 11 || d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

/**
 * Date-of-birth picker.
 *
 * A wheel rather than a calendar: for a birthday the weekday carries no
 * information anyone wants, yet a calendar grid spends its entire layout on
 * encoding it. Three drums spend that space on the values that matter, and
 * match the native birthday input on both iOS and Android.
 *
 * Replaces `<input type="date">`, whose popup is drawn by the browser and
 * can't be themed, and whose mm/dd/yyyy hint renders in the input's text
 * colour rather than as a real placeholder.
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
  // Draft while the sheet is up; only written back on Done.
  const [y, setY] = useState(parsed?.y ?? maxYear - 20);
  const [m, setM] = useState(parsed?.m ?? 0);
  const [d, setD] = useState(parsed?.d ?? 1);

  // Options are filtered, not disabled — a future date can't be scrolled to at
  // all, so there's no dead row to land on.
  const years = useMemo(() => {
    const out: WheelOption[] = [];
    for (let yr = maxYear; yr >= MIN_YEAR; yr--) out.push({ value: yr, label: String(yr) });
    return out;
  }, [maxYear]);

  const months = useMemo(() => {
    const last = y === maxYear ? today.getMonth() : 11;
    return MONTHS_SHORT.slice(0, last + 1).map((label, i) => ({ value: i, label }));
  }, [y, maxYear, today]);

  const days = useMemo(() => {
    const cap = y === maxYear && m === today.getMonth() ? today.getDate() : daysInMonth(y, m);
    return Array.from({ length: cap }, (_, i) => ({ value: i + 1, label: String(i + 1) }));
  }, [y, m, maxYear, today]);

  // Keep the draft legal as the drums move: Feb 30 and future dates can't exist.
  useEffect(() => { if (m > months.length - 1) setM(months.length - 1); }, [months.length, m]);
  useEffect(() => { if (d > days.length) setD(days.length); }, [days.length, d]);

  function openSheet() {
    const p = parseValue(value);
    setY(p?.y ?? maxYear - 20);
    setM(p?.m ?? 0);
    setD(p?.d ?? 1);
    setOpen(true);
  }

  function commit() {
    onChange(`${y}-${pad2(m + 1)}-${pad2(d)}`);
    setOpen(false);
  }

  const label = parsed ? `${MONTHS_LONG[parsed.m]} ${parsed.d}, ${parsed.y}` : "Select your date of birth";

  return (
    <>
      <button
        type="button"
        id={id}
        onClick={openSheet}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`flex h-12 w-full items-center justify-between rounded-xl border bg-white/[0.06] px-4 text-left text-sm outline-none transition ${
          open ? "border-white/25" : "border-white/5"
        } ${parsed ? "text-foreground" : "text-faint"}`}
      >
        <span>{label}</span>
        <Cake size={17} className="shrink-0 text-faint" />
      </button>

      {/* A sheet, not a dropdown: the auth card is overflow-hidden, so an
          absolutely-positioned popover gets clipped at the card's edge. */}
      <BottomSheet open={open} onClose={() => setOpen(false)} title="When's your birthday?">
        <div className="pb-2">
          <WheelFrame>
            <WheelColumn options={months} value={m} onChange={setM} ariaLabel="Month" align="right" />
            <WheelColumn options={days} value={d} onChange={setD} ariaLabel="Day" />
            <WheelColumn options={years} value={y} onChange={setY} ariaLabel="Year" align="left" />
          </WheelFrame>

          <button
            type="button"
            onClick={commit}
            className="mt-4 h-12 w-full rounded-xl bg-accent text-sm font-bold text-accent-ink transition active:scale-[0.99]"
          >
            Use {MONTHS_SHORT[m]} {d}, {y}
          </button>
        </div>
      </BottomSheet>
    </>
  );
}
