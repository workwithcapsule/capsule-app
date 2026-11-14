import { describe, expect, it } from "vitest";
import { buildContext, contextMessage } from "@/lib/ai/context";
import { guessComponents } from "@/lib/ai/guess";
import { ShapeOutput } from "@/lib/ai/schema";
import { realDate, toDraft } from "@/lib/ai/validate";

const ctx = buildContext({
  today: "2026-11-14",
  me: "u-christina",
  types: [
    { id: "t-tech", name: "Tech", description: "Engineering work" },
    { id: "t-sales", name: "Sales", description: null },
    { id: "t-ops", name: "Operations", description: null },
  ],
  spaces: [{ id: "s-en", name: "Engineering", keyPrefix: "EN", description: null, joined: true }],
  people: [
    { id: "u-dana", name: "Dana", usualTypeIds: ["t-tech"] },
    { id: "u-christina", name: "Christina", usualTypeIds: [] },
  ],
  recent: [],
});

const answer = (patch: Partial<ShapeOutput> = {}): ShapeOutput => ({
  name: "Partner referral launch",
  outcome: "Partners can refer partners.",
  space: "s1",
  launch_date: "2027-01-15",
  date_type: "launch",
  owner: "p1",
  components: [
    {
      component: "c1",
      goal: "Referral links are live.",
      owner: "p2",
      due_date: "2027-01-10",
      work_items: [{ title: "Build referral tracking", assignee: "p2" }],
    },
  ],
  note: null,
  ...patch,
});

describe("shaping context", () => {
  it("gives the asking person p1 and lists only the org's refs", () => {
    expect(ctx.people.map((p) => `${p.ref}:${p.name}`)).toEqual(["p1:Christina", "p2:Dana"]);
    const msg = contextMessage(ctx, "Launch referrals");
    expect(msg).toContain("Today is Saturday, 2026-11-14.");
    expect(msg).toContain("- c1: Tech (Engineering work)");
    expect(msg).toContain("- p2: Dana [Tech]");
    expect(msg).toContain("<description>\nLaunch referrals\n</description>");
  });
});

describe("checking Claude's answer", () => {
  it("maps refs back to the org's own ids", () => {
    const d = toDraft(answer(), ctx, "x");
    expect(d.spaceId).toBe("s-en");
    expect(d.ownerId).toBe("u-christina");
    expect(d.components[0]).toMatchObject({
      typeId: "t-tech",
      ownerId: "u-dana",
      dueDate: "2027-01-10",
      items: [{ title: "Build referral tracking", assigneeId: "u-dana" }],
    });
  });

  it("drops components and people that aren't in the org", () => {
    const d = toDraft(
      answer({
        components: [
          { component: "c9", goal: "x", owner: null, due_date: null, work_items: [] },
          {
            component: "c2",
            goal: "y",
            owner: "p7",
            due_date: null,
            work_items: [{ title: "Call", assignee: "Bob" }],
          },
          { component: "c2", goal: "duplicate", owner: null, due_date: null, work_items: [] },
        ],
      }),
      ctx,
      "x",
    );
    expect(d.components).toHaveLength(1);
    expect(d.components[0]).toMatchObject({ typeId: "t-sales", ownerId: null, goal: "y" });
    expect(d.components[0].items[0].assigneeId).toBeNull();
  });

  it("blanks impossible or past dates and keeps component dates on or before launch", () => {
    expect(realDate("2027-02-30")).toBeNull();
    const d = toDraft(
      answer({
        launch_date: "2027-01-15",
        components: [
          { component: "c1", goal: "", owner: null, due_date: "2027-03-01", work_items: [] },
          { component: "c2", goal: "", owner: null, due_date: "2026-01-01", work_items: [] },
        ],
      }),
      ctx,
      "x",
    );
    expect(d.components.map((c) => c.dueDate)).toEqual(["2027-01-15", null]);
    expect(toDraft(answer({ launch_date: "2025-12-01" }), ctx, "x").launchDate).toBeNull();
  });

  it("falls back to the description when the name or outcome is empty", () => {
    const d = toDraft(
      answer({ name: " ", outcome: "" }),
      ctx,
      "launch the referral program by January.",
    );
    expect(d.name).toBe("Launch the referral program by January");
    expect(d.outcome).toBe("launch the referral program by January.");
  });
});

describe("guessing components while you type", () => {
  it("lights up components named or hinted at", () => {
    const types = ctx.components;
    expect(
      guessComponents("Train the sales reps and fix the API", types).map((t) => t.name),
    ).toEqual(["Tech", "Sales"]);
    expect(guessComponents("", types)).toEqual([]);
  });
});
