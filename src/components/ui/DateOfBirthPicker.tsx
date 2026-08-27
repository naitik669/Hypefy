"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Cake } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MIN_YEAR = 1900;
const ITEM_H = 44;   // px per wheel row
const VISIBLE = 5;   // rows shown at once (odd, so one sits centred)
const PAD = ((VISIBLE - 1) / 2) * ITEM_H;

const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
const pad2 = (n: number) => String(n).padStart(2, "0");
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function parseValue(v: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!match) return null;
  const y = Number(match[1]), m = Number(match[2]) - 1, d = Number(match[3]);
  if (m < 0 || m > 11 || d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

type Option = { value: number; label: string };

/**
 * One drum of the wheel. Whatever row sits under the centre band is the value,
 * so scrolling and tapping are the same gesture. Rows fade and shrink with
 * distance from centre — that falloff is what makes the column read as a
 * physical drum instead of a list.
 */
function WheelColumn({
  options,
  value,
  onChange,
  ariaLabel,
  align = "center",
}: {
  options: Option[];
  value: number;
  onChange: (next: number) => void;
  ariaLabel: string;
  align?: "center" | "left" | "right";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const index = clamp(options.findIndex((o) => o.value === value), 0, options.length - 1);

  // Index we last wrote or read. Without this the column feeds back on itself:
  // a scroll commits a value, the new value re-runs the align effect, that
  // scroll fires another event, and the drum walks away on its own.
  const committed = useRef(index);

  // Align on mount without animating — the sheet is still coming up.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = index * ITEM_H;
    committed.current = index;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-align only when the value changed from outside (day 31 clamped to 28
  // after switching to February, say) — never for our own scroll.
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
      const i = clamp(Math.round(el.scrollTop / ITEM_H), 0, options.length - 1);
      if (i === committed.current) return;
      committed.current = i;
      const next = options[i];
      if (next && next.value !== value) onChange(next.value);
    }, 110);
  }

  function select(i: number) {
    const el = ref.current;
    committed.current = i;
    el?.scrollTo({ top: i * ITEM_H, behavior: "smooth" });
    const next = options[i];
    if (next && next.value !== value) onChange(next.value);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    select(clamp(index + (e.key === "ArrowDown" ? 1 : -1), 0, options.length - 1));
  }

  const justify =
    align === "left" ? "justify-start pl-5" : align === "right" ? "justify-end pr-5" : "justify-center";

  return (
    <div
      ref={ref}
      role="listbox"
      aria-label={ariaLabel}
      tabIndex={0}
      onScroll={onScroll}
      onKeyDown={onKeyDown}
      className="no-scrollbar flex-1 snap-y snap-mandatory overflow-y-auto rounded-xl outline-none focus-visible:ring-1 focus-visible:ring-accent/50"
      style={{ height: VISIBLE * ITEM_H }}
    >
      <div style={{ height: PAD }} aria-hidden />
      {options.map((o, i) => {
        const dist = Math.abs(i - index);
        const opacity = dist === 0 ? 1 : dist === 1 ? 0.4 : dist === 2 ? 0.16 : 0.07;
        const scale = dist === 0 ? 1 : dist === 1 ? 0.9 : 0.82;
        return (
          <button
            key={o.value}
            type="button"
            role="option"
            aria-selected={dist === 0}
            tabIndex={-1}
            onClick={() => select(i)}
            style={{ height: ITEM_H, opacity, transform: `scale(${scale})` }}
            className={`flex w-full snap-center items-center ${justify} whitespace-nowrap tabular-nums transition-[opacity,transform] duration-150 ${
              dist === 0 ? "text-[19px] font-extrabold text-foreground" : "text-[17px] font-semibold text-muted"
            }`}
          >
            {o.label}
          </button>
        );
      })}
      <div style={{ height: PAD }} aria-hidden />
    </div>
  );
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
    const out: Option[] = [];
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
          <div className="relative mt-1">
            {/* Selection band — the one bright element. Behind the drums, so
                the centred row reads as locked into it. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-xl border border-accent/35 bg-accent/[0.10]"
              style={{ height: ITEM_H }}
            />
            {/* Feather the top and bottom so the drums look continuous rather
                than abruptly clipped. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-10"
              style={{
                background:
                  "linear-gradient(var(--color-elevated) 2%, transparent 30%, transparent 70%, var(--color-elevated) 98%)",
              }}
            />
            <div className="flex">
              <WheelColumn options={months} value={m} onChange={setM} ariaLabel="Month" align="right" />
              <WheelColumn options={days} value={d} onChange={setD} ariaLabel="Day" />
              <WheelColumn options={years} value={y} onChange={setY} ariaLabel="Year" align="left" />
            </div>
          </div>

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
