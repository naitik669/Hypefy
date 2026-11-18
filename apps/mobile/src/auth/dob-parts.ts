import { composeDob, daysInMonth } from "@hypefy/core/dob";

/**
 * Three typed-in numbers to a stored date, or "" when they are not one yet.
 *
 * In its own module, with no React Native import, so a Node test can CALL
 * it. It began as a closure inside DobField and the test for it read the
 * source for `onChange("")` — which was satisfied by one of the two
 * branches while the other published a made-up date. Mutation C3 found
 * that, and it is the same lesson as the FCM key test: a check that reads
 * the code beside the behaviour tests the reading, not the behaviour.
 *
 * The rule is that nothing is published until all three parts make a date
 * that exists. A half-typed year matters more than it looks: `new
 * Date("0002-01-01")` is a real date in the year 2, so publishing while
 * someone types would hand the age gate a two-thousand-year-old for three
 * keystrokes and be waved straight through.
 */
export type DobParts = { d: string; m: string; y: string };

export function dobFromParts(parts: DobParts): string {
  // A year is four digits or it is not a year yet.
  if (parts.y.length !== 4) return "";
  if (parts.m.length === 0 || parts.d.length === 0) return "";

  const year = Number(parts.y);
  const month = Number(parts.m);
  const day = Number(parts.d);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return "";
  if (month < 1 || month > 12) return "";
  if (day < 1 || day > daysInMonth(year, month - 1)) return "";

  return composeDob(year, month - 1, day);
}

/** Digits only, capped — a paste of anything else is dropped, not mangled. */
export function digitsOnly(raw: string, max: number): string {
  return raw.replace(/\D/g, "").slice(0, max);
}
