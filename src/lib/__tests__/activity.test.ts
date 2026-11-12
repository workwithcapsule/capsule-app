import { describe as group, expect, it } from "vitest";
import { buildFeed, describe, splitMentions, type ActivityEvent } from "@/lib/activity";

const ME = "u-me";
const DANA = "u-dana";
const base = Date.parse("2026-11-12T10:00:00Z");
let n = 0;
const ev = (
  minutes: number,
  kind: string,
  data: Record<string, unknown> = {},
  actorId: string | null = ME,
): ActivityEvent => ({
  id: `e${++n}`,
  kind,
  actorId,
  data,
  at: new Date(base + minutes * 60_000).toISOString(),
});

const ctx = {
  meId: ME,
  nameOf: (id: string) => ({ [DANA]: "Dana Kim" })[id],
  dateType: "launch" as const,
  today: new Date("2026-11-12T12:00:00Z"),
};
const text = (events: ActivityEvent[]) => buildFeed(events).map((e) => describe(e, ctx));

group("buildFeed", () => {
  it("shows newest first", () => {
    expect(
      text([
        ev(0, "capsule_created"),
        ev(1, "component_added", { component_id: "c1", component: "Tech" }),
      ]),
    ).toEqual(["added the Tech component", "created this capsule"]);
  });

  it("merges quick edits to the same field into one entry, first value to last", () => {
    const feed = text([
      ev(0, "capsule_changed", { field: "status", from: "not_started", to: "in_progress" }),
      ev(2, "capsule_changed", { field: "status", from: "in_progress", to: "in_review" }),
    ]);
    expect(feed).toEqual(["moved the capsule to In Review"]);
    const [entry] = buildFeed([
      ev(0, "capsule_changed", { field: "launch_date", from: "2026-12-01", to: "2026-12-05" }),
      ev(1, "capsule_changed", { field: "launch_date", from: "2026-12-05", to: "2026-12-15" }),
    ]);
    expect(describe(entry, ctx)).toBe("moved the launch date from Dec 1 to Dec 15");
  });

  it("keeps edits apart when they're more than a few minutes apart, or by different people", () => {
    expect(
      text([
        ev(0, "capsule_changed", { field: "status", from: "not_started", to: "in_progress" }),
        ev(10, "capsule_changed", { field: "status", from: "in_progress", to: "in_review" }),
      ]),
    ).toHaveLength(2);
    expect(
      text([
        ev(0, "capsule_changed", { field: "status", from: "not_started", to: "in_progress" }),
        ev(1, "capsule_changed", { field: "status", from: "in_progress", to: "done" }, DANA),
      ]),
    ).toHaveLength(2);
  });

  it("hides a change and its Undo", () => {
    expect(
      text([
        ev(0, "item_changed", {
          item_id: "i1",
          title: "Ship",
          field: "done",
          from: false,
          to: true,
        }),
        ev(0.1, "item_changed", {
          item_id: "i1",
          title: "Ship",
          field: "done",
          from: true,
          to: false,
        }),
      ]),
    ).toEqual([]);
  });

  it("hides something added and removed again (and removed and put back)", () => {
    expect(
      text([
        ev(0, "item_added", { item_id: "i1", title: "Draft", component: "Tech" }),
        ev(0.5, "item_changed", {
          item_id: "i1",
          title: "Draft",
          field: "done",
          from: false,
          to: true,
        }),
        ev(1, "item_deleted", { item_id: "i1", title: "Draft", component: "Tech" }),
      ]),
    ).toEqual([]);
    expect(
      text([
        ev(0, "component_removed", {
          component_id: "c1",
          component: "Tech",
          items: 2,
          moved_to: "Ops",
        }),
        ev(0.2, "component_restored", { component_id: "c1", component: "Tech" }),
      ]),
    ).toEqual([]);
  });

  it("keeps an add and a later removal when they're far apart", () => {
    expect(
      text([
        ev(0, "component_added", { component_id: "c1", component: "Sales" }),
        ev(30, "component_removed", { component_id: "c1", component: "Sales", items: 0 }),
      ]),
    ).toEqual(["removed the Sales component", "added the Sales component"]);
  });

  it("hides deleted comments, and shows them again after Undo", () => {
    const c = ev(0, "comment", { body: "Hello" });
    const del = ev(1, "comment_deleted", { comment_id: c.id });
    expect(text([c, del])).toEqual([]);
    expect(text([c, del, ev(1.1, "comment_restored", { comment_id: c.id })])).toEqual(["Hello"]);
  });
});

group("describe", () => {
  it("writes plain sentences", () => {
    const one = (e: ActivityEvent) => describe(buildFeed([e])[0], ctx);
    expect(
      one(ev(0, "component_changed", { component: "Tech", field: "status", to: "done" })),
    ).toBe("marked Tech done");
    expect(
      one(
        ev(0, "item_changed", {
          item_id: "i",
          title: "API",
          field: "assignee",
          from: null,
          to: DANA,
        }),
      ),
    ).toBe("assigned “API” to Dana Kim");
    expect(
      one(
        ev(0, "item_changed", {
          item_id: "i",
          title: "API",
          field: "assignee",
          from: null,
          to: ME,
        }),
      ),
    ).toBe("took “API”");
    expect(
      one(ev(0, "component_removed", { component: "Tech", items: 1, moved_to: "Operations" })),
    ).toBe("removed the Tech component and moved its 1 work item to Operations");
    expect(one(ev(0, "collaborator_added", { component: "Tech", user_id: DANA }))).toBe(
      "added Dana Kim to Tech",
    );
  });
});

group("splitMentions", () => {
  const people = [
    { id: "d", name: "Dana" },
    { id: "dk", name: "Dana Kim" },
    { id: "j", name: "Jon" },
  ];
  it("finds @mentions by full name, longest first", () => {
    expect(splitMentions("@Dana Kim and @Jon, look", people)).toEqual([
      { text: "@Dana Kim", mention: "dk" },
      { text: " and " },
      { text: "@Jon", mention: "j" },
      { text: ", look" },
    ]);
  });
  it("leaves emails and unknown names alone", () => {
    expect(splitMentions("mail jon@acme.test or @Zed", people)).toEqual([
      { text: "mail jon@acme.test or @Zed" },
    ]);
  });
});
