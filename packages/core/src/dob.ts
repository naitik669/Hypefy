/**
 * Dates of birth, as the one string shape both clients store.
 *
 * `YYYY-MM-DD`, which is what `signUp` puts in `date_of_birth` and what
 * `ageFromDob` reads. The two clients ask for it through completely
 * different controls — the web spins three wheels in a sheet, the phone
 * takes three numbers — so the composing and the validity rule are here,
 * where there is one of each.
 *
 * The rule worth sharing is the month length. 31 February and 29 February
 * in a common year are the inputs that a naive form accepts and the
 * database then rejects, or worse, silently rolls forward into March.
 */

/** How many days that month has, leap years included. */
export function daysInMonth(year: number, monthIndex: number): number {
  // Day 0 of the next month is the last day of this one, and Date does the
  // leap-year arithmetic — including the 400-year rule, which hand-written
  // checks usually miss.
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** `2000-01-05`, with both parts padded, from its three numbers. */
export function composeDob(year: number, monthIndex: number, day: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

/**
 * The three numbers back out of a stored date, or null when it is not one.
 *
 * `monthIndex` is 0-11, matching `Date` and `daysInMonth`, because the
 * alternative — 1-12 here and 0-11 everywhere else — is the off-by-one that
 * shows up as a birthday a month out.
 */
export function parseDob(
  value: string,
): { year: number; monthIndex: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (monthIndex < 0 || monthIndex > 11) return null;
  if (day < 1 || day > daysInMonth(year, monthIndex)) return null;
  return { year, monthIndex, day };
}

/** The earliest year either client offers. */
export const MIN_DOB_YEAR = 1900;
