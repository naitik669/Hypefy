/**
 * Shared time formatting utilities for Hypefy.
 * All functions output clean ASCII-safe strings -- no smart quotes,
 * no em dashes, no encoded separators that can corrupt in transit.
 */

/**
 * Relative time: "just now", "5m", "2h", "3d", "Jun 5"
 * Used everywhere a compact relative timestamp is needed.
 */
export function timeAgo(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

/**
 * Short relative time: "now", "5m", "2h", "3d"
 * Used in comment threads and compact contexts.
 */
export function timeAgoShort(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/**
 * Message time label: "2:30 PM"
 * Used in chat bubbles.
 */
export function formatMessageTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * Day separator label: "Today", "Yesterday", "Mon Jun 3", "Jun 5, 2024"
 * Used between chat message groups.
 */
export function formatDayLabel(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const startOf = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff === -1) return "Tomorrow";
  if (diff > 1 && diff < 7)
    return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Post timestamp: "Jun 5" or "Jun 5, 2023" for older posts.
 * Used on post detail pages.
 */
export function formatPostDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}
