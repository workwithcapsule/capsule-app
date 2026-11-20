import { describe, expect, it } from "vitest";
import { buildFeed, describe as sentence, type ActivityEvent } from "@/lib/activity";
import { followPieces, piecesDone, suggestStatus, withStatus } from "@/lib/work-items";

const item = { status: "not_started" as const, done: false, statusManual: false };

describe("suggestStatus (the same rule as the database)", () => {
  it("has nothing to suggest without pieces", () => {
    expect(suggestStatus([])).toBeNull();
  });
  it("is Done only when every piece is done", () => {
    expect(suggestStatus([{ status: "done" }, { status: "done" }])).toBe("done");
    expect(suggestStatus([{ status: "done" }, { status: "not_started" }])).toBe("in_progress");
  });
  it("is In review when any piece is in review", () => {
    expect(suggestStatus([{ status: "in_review" }, { status: "in_progress" }])).toBe("in_review");
  });
  it("is Not started when nothing has started", () => {
    expect(suggestStatus([{ status: "not_started" }])).toBe("not_started");
  });
});

describe("item status", () => {
  it("follows its pieces until someone sets it by hand", () => {
    const followed = followPieces(item, [{ status: "in_progress" }]);
    expect(followed.status).toBe("in_progress");
    const byHand = withStatus(followed, "in_review", true);
    expect(byHand.statusManual).toBe(true);
    expect(followPieces(byHand, [{ status: "done" }]).status).toBe("in_review");
  });
  it("checks the item off when it reaches Done", () => {
    expect(followPieces(item, [{ status: "done" }]).done).toBe(true);
    expect(withStatus(item, "done", false)).toMatchObject({ done: true, statusManual: false });
  });
  it("counts pieces done", () => {
    expect(piecesDone([{ status: "done" }, { status: "in_progress" }])).toBe("1 of 2 done");
  });
});

describe("activity sentences for pieces", () => {
  const ME = "u-me";
  const DANA = "u-dana";
  const ctx = {
    meId: ME,
    nameOf: (id: string) => ({ [DANA]: "Dana" })[id],
    dateType: "launch" as const,
  };
  let n = 0;
  const ev = (kind: string, data: Record<string, unknown>, actorId = ME): ActivityEvent => ({
    id: `e${++n}`,
    kind,
    actorId,
    data: { item_id: "i1", title: "Ship it", ...data },
    at: new Date(Date.UTC(2026, 10, 15, 10, n)).toISOString(),
  });
  const say = (e: ActivityEvent) => sentence(buildFeed([e])[0], ctx);

  it("writes plain sentences", () => {
    expect(say(ev("piece_added", { user: DANA, piece: "UI" }))).toBe(
      "added Dana to “Ship it” for “UI”",
    );
    expect(say(ev("piece_removed", { user: ME }))).toBe("left “Ship it”");
    expect(
      say(
        ev("piece_changed", { user: DANA, field: "status", from: "not_started", to: "done" }, DANA),
      ),
    ).toBe("finished their part of “Ship it”");
    expect(
      say(
        ev("piece_changed", { user: DANA, field: "status", from: "not_started", to: "in_review" }),
      ),
    ).toBe("moved Dana’s part of “Ship it” to In review");
    expect(say(ev("piece_changed", { user: DANA, field: "lead", from: false, to: true }))).toBe(
      "made Dana the lead on “Ship it”",
    );
    expect(
      say(ev("item_changed", { field: "status", from: "not_started", to: "in_progress" })),
    ).toBe("moved “Ship it” to In progress");
  });

  it("hides someone added and removed again", () => {
    const feed = buildFeed([
      ev("piece_added", { user: DANA, piece: "UI" }),
      ev("piece_removed", { user: DANA, piece: "UI" }),
    ]);
    expect(feed).toHaveLength(0);
  });
});
