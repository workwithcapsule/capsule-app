/** Dates are stored as YYYY-MM-DD (no time zone) and shown like the prototype: "Dec 1". */

export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function fmtDate(iso: string | null | undefined, today = new Date()): string {
  if (!iso) return "";
  const date = parseDate(iso);
  const sameYear = date.getFullYear() === today.getFullYear();
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(date);
}

/** Whole days from today to the date (negative if it has passed). */
export function daysUntil(iso: string, today = new Date()): number {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((parseDate(iso).getTime() - start.getTime()) / 86_400_000);
}

/** "Just now", "5m ago", "3h ago", "Yesterday", then a date (prototype "Updated" column). */
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
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(then.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  }).format(then);
}
