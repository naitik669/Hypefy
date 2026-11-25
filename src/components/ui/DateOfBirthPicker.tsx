"use client";

import { useMemo, useState } from "react";
import { Cake } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { WheelColumn, WheelFrame, type WheelOption } from "@/components/ui/Wheel";
import { MIN_DOB_YEAR, composeDob, daysInMonth, parseDob } from "@/lib/dob";

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/*
 * The year floor, the month lengths and the parse moved to
 * @hypefy/core/dob, because the phone's date-of-birth field needs the same
 * rule about which dates exist. The two CONTROLS are deliberately
 * different — a wheel in a sheet here, three number fields there — so what
 * is shared is only the part that could disagree silently, and 31 February
 * is refused identically by both.
 */
function parseValue(v: string): { y: number; m: number; d: number } | null {
  const parsed = parseDob(v);
  if (!parsed) return null;
  return { y: parsed.year, m: parsed.monthIndex, d: parsed.day };
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
    for (let yr = maxYear; yr >= MIN_DOB_YEAR; yr--) out.push({ value: yr, label: String(yr) });
    return out;
  }, [maxYear]);

  const months = useMemo(() => {
    const last = y === maxYear ? today.getMonth() : 11;
    return MONTHS_SHORT.slice(0, last + 1).map((label, i) => ({ value: i, label }));
  }, [y, maxYear, today]);

  /*
   * Keeping the draft legal as the drums move: Feb 30 and future dates
   * cannot exist.
   *
   * This was two effects that wrote the clamp back into state. Deriving it
   * instead fixes two things at once.
   *
   * The React one: a setState in an effect body renders the whole sheet a
   * second time for every move of a drum, and the first of those renders
   * draws a date that cannot exist — Feb 31 is on screen for a frame before
   * the effect corrects it.
   *
   * The behavioural one, which is the better reason: writing the clamp back
   * DESTROYED the pick. Choose 31, move the month to February, move it back
   * to March, and the day had been overwritten with 28. Derived, the 31 is
   * still there to come back to, and only the illegal combination is
   * withheld — which is how the native pickers on both phones behave.
   */
  const mSafe = Math.min(m, months.length - 1);

  const days = useMemo(() => {
    /*
     * `mSafe` and `m` are provably equal wherever daysInMonth is reached, so
     * a mutation swapping them here cannot be caught and is recorded as
     * equivalent rather than left looking proven. The proof: the months list
     * is only ever truncated when y is the current year, and the clamp then
     * lands exactly on today's month — which is the first branch. In every
     * other case the list holds all twelve and nothing is clamped.
     *
     * It stays `mSafe` because the equality is a property of the condition
     * above it, not of this line, and that condition is free to change.
     */
    const cap =
      y === maxYear && mSafe === today.getMonth() ? today.getDate() : daysInMonth(y, mSafe);
    return Array.from({ length: cap }, (_, i) => ({ value: i + 1, label: String(i + 1) }));
  }, [y, mSafe, maxYear, today]);

  const dSafe = Math.min(d, days.length);

  function openSheet() {
    const p = parseValue(value);
    setY(p?.y ?? maxYear - 20);
    setM(p?.m ?? 0);
    setD(p?.d ?? 1);
    setOpen(true);
  }

  function commit() {
    onChange(composeDob(y, mSafe, dSafe));
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
            <WheelColumn options={months} value={mSafe} onChange={setM} ariaLabel="Month" align="right" />
            <WheelColumn options={days} value={dSafe} onChange={setD} ariaLabel="Day" />
            <WheelColumn options={years} value={y} onChange={setY} ariaLabel="Year" align="left" />
          </WheelFrame>

          <button
            type="button"
            onClick={commit}
            className="mt-4 h-12 w-full rounded-xl bg-accent text-sm font-bold text-accent-ink transition active:scale-[0.99]"
          >
            Use {MONTHS_SHORT[mSafe]} {dSafe}, {y}
          </button>
        </div>
      </BottomSheet>
    </>
  );
}
