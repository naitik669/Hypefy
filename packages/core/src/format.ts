/** Compact number formatting for engagement counts (e.g. 1200 → "1.2k"). */
export function formatCount(n: number): string {
  if (n >= 1000) {
    const v = n / 1000;
    return `${v >= 10 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, "")}k`;
  }
  return `${n}`;
}
