import type { Status } from "@/lib/design";

/*
 * Work item statuses and pieces (step 12). Work items use the four work
 * statuses; Blocked is only for capsules and components. The rules here
 * mirror the database (private.suggested_item_status), so the page can show
 * the result before the server has saved it.
 */

export type ItemStatus = Exclude<Status, "blocked">;

export const ITEM_STATUSES: ItemStatus[] = ["not_started", "in_progress", "in_review", "done"];

/** What the pieces add up to, or null when there are none. */
export function suggestStatus(pieces: { status: ItemStatus }[]): ItemStatus | null {
  if (!pieces.length) return null;
  if (pieces.every((p) => p.status === "done")) return "done";
  if (pieces.some((p) => p.status === "in_review")) return "in_review";
  if (pieces.some((p) => p.status !== "not_started")) return "in_progress";
  return "not_started";
}

/**
 * The item after someone sets its status or checks it off, the same way the
 * database works it out: by hand on an item with pieces, it stops following
 * them until someone picks "Use suggestion".
 */
export function withStatus<T extends { status: ItemStatus; done: boolean; statusManual: boolean }>(
  item: T,
  status: ItemStatus,
  hasPieces: boolean,
): T {
  return { ...item, status, done: status === "done", statusManual: hasPieces || item.statusManual };
}

/** The item's status once its pieces change (unless it was set by hand). */
export function followPieces<
  T extends { status: ItemStatus; done: boolean; statusManual: boolean },
>(item: T, pieces: { status: ItemStatus }[]): T {
  const s = suggestStatus(pieces);
  if (!s || item.statusManual) return item;
  return { ...item, status: s, done: s === "done" };
}

/** "1 of 2 done" for the work item row. */
export function piecesDone(pieces: { status: ItemStatus }[]): string {
  return `${pieces.filter((p) => p.status === "done").length} of ${pieces.length} done`;
}
