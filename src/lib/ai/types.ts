/** A capsule suggested by AI shaping, ready to fill the review page (step 9). */
export type ShapedDraft = {
  name: string;
  outcome: string;
  spaceId: string | null;
  launchDate: string | null;
  dateType: "launch" | "due";
  ownerId: string | null;
  components: {
    typeId: string;
    ownerId: string | null;
    dueDate: string | null;
    goal: string;
    items: { title: string; assigneeId: string | null }[];
  }[];
  /** Shown on the review page when something couldn't be done as asked. */
  note: string | null;
};

export type ShapeResult =
  | { ok: true; draft: ShapedDraft; requestId: string }
  | { ok: false; kind: "not_configured" | "limit" | "failed" | "empty"; error: string };
