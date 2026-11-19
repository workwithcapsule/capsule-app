/** Dates are stored as YYYY-MM-DD (no time zone) and shown like the prototype: "Dec. 1 2026". */

export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const MONTHS = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "Jun.", "Jul.", "Aug.", "Sep.", "Oct.", "Nov.", "Dec."];

/** "Nov. 11 2026", always with the year (prototype fmtDate). */
function fmtDay(date: Date): string {
  return `${MONTHS[date.getMonth()]} ${date.getDate()} ${date.getFullYear()}`;
}

// `today` is kept so callers (and tests) can pass one; the format no longer depends on it.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function fmtDate(iso: string | null | undefined, today = new Date()): string {
  if (!iso) return "";
  return fmtDay(parseDate(iso));
}

/** Whole days from today to the date (negative if it has passed). */
export function daysUntil(iso: string, today = new Date()): number {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((parseDate(iso).getTime() - start.getTime()) / 86_400_000);
}

/** "Just now", "5m ago", "3h ago", "Yesterday", a weekday this week ("Mon"), then a date (prototype "Updated" column). */
export function fmtRelative(iso: string, now = new Date()): string {
  const then = new Date(iso);
  const mins = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24 && then.getDate() === now.getDate()) return `${hours}h ago`;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (
    then.getFullYear() === yesterday.getFullYear() &&
    then.getMonth() === yesterday.getMonth() &&
    then.getDate() === yesterday.getDate()
  ) {
    return "Yesterday";
  }
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (startOfToday.getTime() - then.getTime() < 6 * 86_400_000)
    return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(then);
  return fmtDay(then);
}
