import { describe, expect, it } from "vitest";
import {
  followSummary,
  followedOnly,
  homeOrder,
  launchIn,
  matchesHomeFilter,
  progressLabel,
  riskOf,
  type SummaryCapsule,
  type SummaryComponent,
} from "@/lib/capsule-summary";

const today = new Date(2026, 10, 20); // Nov. 20 2026
const comp = (name: string, status: SummaryComponent["status"], hasOwner = true) => ({
  name,
  status,
  hasOwner,
});
const cap = (over: Partial<SummaryCapsule> = {}): SummaryCapsule => ({
  status: "in_progress",
  launchDate: "2026-12-01",
  components: [comp("Tech", "in_progress"), comp("Marketing", "not_started")],
  created: false,
  working: true,
  following: false,
  ...over,
});

describe("progressLabel", () => {
  it("counts done components", () => {
    expect(progressLabel(cap({ components: [comp("A", "done"), comp("B", "in_review")] }))).toBe(
      "1 of 2 done",
    );
  });
  it("says Not started, Done and Blocked", () => {
    expect(progressLabel(cap({ components: [comp("A", "not_started")] }))).toBe("Not started");
    expect(progressLabel(cap({ components: [comp("A", "done")] }))).toBe("Done");
    expect(progressLabel(cap({ status: "blocked" }))).toBe("Blocked");
  });
});

describe("riskOf", () => {
  it("names a blocked component whenever the launch is ahead", () => {
    expect(
      riskOf(cap({ launchDate: "2027-03-01", components: [comp("Tech", "blocked")] }), today),
    ).toBe("Tech is blocked");
  });
  it("names components with no owner only within two weeks of launch", () => {
    const c = cap({ components: [comp("Support", "not_started", false), comp("Tech", "done")] });
    expect(riskOf({ ...c, launchDate: "2026-12-04" }, today)).toBe("Support has no owner");
    expect(riskOf({ ...c, launchDate: "2026-12-05" }, today)).toBe("");
    expect(
      riskOf(
        cap({
          launchDate: "2026-11-25",
          components: [comp("Sales", "in_progress", false), comp("Legal", "not_started", false)],
        }),
        today,
      ),
    ).toBe("Sales and Legal have no owner");
  });
  it("is quiet for done capsules, passed dates, no date and done components", () => {
    const blocked = [comp("Tech", "blocked")];
    expect(riskOf(cap({ status: "done", components: blocked }), today)).toBe("");
    expect(riskOf(cap({ launchDate: "2026-11-19", components: blocked }), today)).toBe("");
    expect(riskOf(cap({ launchDate: null, components: blocked }), today)).toBe("");
    expect(
      riskOf(cap({ launchDate: "2026-11-22", components: [comp("Tech", "done", false)] }), today),
    ).toBe("");
  });
});

describe("Home order and filters", () => {
  it("leaves out done capsules, puts yours before followed ones, then soonest launch", () => {
    const a = cap({ launchDate: "2026-12-10" });
    const b = cap({ launchDate: "2026-12-01", working: false, following: true });
    const c = cap({ launchDate: null, created: true });
    const d = cap({ launchDate: "2026-11-30" });
    const e = cap({ status: "done" });
    expect(homeOrder([a, b, c, d, e])).toEqual([d, a, c, b]);
  });
  it("filters by how you relate to the capsule", () => {
    const followed = cap({ working: false, following: true });
    expect(matchesHomeFilter(followed, "all")).toBe(true);
    expect(matchesHomeFilter(followed, "following")).toBe(true);
    expect(matchesHomeFilter(followed, "working")).toBe(false);
  });
});

describe("Capsules you follow", () => {
  it("lists open capsules you only follow, soonest first", () => {
    const x = cap({ working: false, following: true, launchDate: "2026-12-20" });
    const y = cap({ working: false, following: true, launchDate: "2026-11-24" });
    const onTeam = cap({ following: true });
    const done = cap({ working: false, following: true, status: "done" });
    expect(followedOnly([x, y, onTeam, done])).toEqual([y, x]);
  });
  it("counts at risk and launches this week", () => {
    const rows = [
      cap({ launchDate: "2026-11-24", components: [comp("Tech", "blocked")] }),
      cap({ launchDate: "2026-11-27" }),
      cap({ launchDate: "2026-12-20" }),
    ];
    expect(followSummary(rows, today)).toEqual({ atRisk: 1, launchingThisWeek: 2 });
  });
  it("says when the launch is", () => {
    expect(launchIn("2026-11-20", today)).toBe("today");
    expect(launchIn("2026-11-21", today)).toBe("in 1 day");
    expect(launchIn("2026-11-26", today)).toBe("in 6 days");
  });
});
