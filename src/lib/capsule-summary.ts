import type { Status } from "@/lib/design";
import { daysUntil } from "@/lib/dates";

/* How a capsule reads at a glance (prototype progressLabel, riskOf, capCardsPanel, followGlance).
 * Shared by the Capsules page and Home's "Your capsules" and "Capsules you follow". */

export type SummaryComponent = { name: string; status: Status; hasOwner: boolean };

export type SummaryCapsule = {
  status: Status;
  launchDate: string | null;
  components: SummaryComponent[];
  created: boolean;
  working: boolean;
  following: boolean;
};

export type HomeFilter = "all" | "created" | "working" | "following";

export const HOME_FILTERS: [HomeFilter, string][] = [
  ["all", "All"],
  ["created", "Created by me"],
  ["working", "Working on"],
  ["following", "Following"],
];

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Blocked", "Done", "Not started" or "2 of 5 done". */
export function progressLabel(c: Pick<SummaryCapsule, "status" | "components">): string {
  const total = c.components.length;
  const done = c.components.filter((k) => k.status === "done").length;
  if (c.status === "blocked") return "Blocked";
  if (c.status === "done" || (total && done === total)) return "Done";
  if (!c.components.some((k) => k.status !== "not_started")) return "Not started";
  return `${done} of ${total} done`;
}

/** "Ann and Bo", "Ann, Bo and Cy". */
function listJoin(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * What's putting the launch at risk, or "" (prototype riskOf): a blocked component
 * whenever the launch is still ahead, or components with no owner once it's two weeks
 * away or less. Nothing for done capsules, or once the date has passed.
 */
export function riskOf(c: SummaryCapsule, today = new Date()): string {
  if (c.status === "done" || !c.launchDate) return "";
  const d = daysUntil(c.launchDate, today);
  if (d < 0) return "";
  const blocked = c.components.filter((k) => k.status === "blocked");
  if (blocked.length) return `${blocked[0].name} is blocked`;
  const unowned = c.components.filter((k) => !k.hasOwner && k.status !== "done");
  if (unowned.length && d <= 14)
    return `${listJoin(unowned.map((k) => k.name))} ${unowned.length === 1 ? "has" : "have"} no owner`;
  return "";
}

export function matchesHomeFilter(c: SummaryCapsule, f: HomeFilter): boolean {
  return f === "all" || c[f];
}

/**
 * Home's "Your capsules": open capsules, the ones you're on before the ones you only
 * follow, then soonest launch first (no date last).
 */
export function homeOrder<T extends SummaryCapsule>(rows: T[]): T[] {
  const followOnly = (c: T) => (c.following && !c.working && !c.created ? 1 : 0);
  return rows
    .filter((c) => c.status !== "done")
    .sort(
      (a, b) =>
        followOnly(a) - followOnly(b) ||
        (a.launchDate ?? "9999").localeCompare(b.launchDate ?? "9999"),
    );
}

/** Capsules you only follow (not on the team, didn't create), open, soonest launch first. */
export function followedOnly<T extends SummaryCapsule>(rows: T[]): T[] {
  return rows
    .filter((c) => c.following && !c.working && !c.created && c.status !== "done")
    .sort((a, b) => (a.launchDate ?? "9999").localeCompare(b.launchDate ?? "9999"));
}

/** The "Capsules you follow" header: how many are at risk and launch within a week. */
export function followSummary(rows: SummaryCapsule[], today = new Date()) {
  return {
    atRisk: rows.filter((c) => riskOf(c, today)).length,
    launchingThisWeek: rows.filter((c) => {
      if (!c.launchDate) return false;
      const d = daysUntil(c.launchDate, today);
      return d >= 0 && d <= 7;
    }).length,
  };
}

/** "today", "in 1 day", "in 6 days", "3 days ago". */
export function launchIn(iso: string, today = new Date()): string {
  const d = daysUntil(iso, today);
  if (d === 0) return "today";
  return d > 0 ? `in ${plural(d, "day")}` : `${plural(-d, "day")} ago`;
}
