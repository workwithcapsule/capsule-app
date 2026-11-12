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
