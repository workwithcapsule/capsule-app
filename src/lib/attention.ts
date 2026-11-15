import type { ComponentColor } from "@/lib/design";

/** One row of Needs your attention (public.needs_attention, step 8). */
export type AttentionRow = {
  /** piece: your part of a work item (title is the item, body your part). */
  kind: "item" | "component" | "no_owner" | "mention" | "piece";
  targetId: string;
  capsuleId: string;
  capsuleKey: string;
  capsuleName: string;
  componentId: string | null;
  componentName: string | null;
  componentColor: ComponentColor | null;
  componentIcon: string | null;
  title: string;
  dueDate: string | null;
  since: string;
  actorId: string | null;
  body: string | null;
};

export type RawAttention = {
  kind: string;
  target_id: string;
  capsule_id: string;
  capsule_key: string;
  capsule_name: string;
  component_id: string | null;
  component_name: string | null;
  component_color: string | null;
  component_icon: string | null;
  title: string;
  due_date: string | null;
  since: string;
  actor_id: string | null;
  body: string | null;
};

export function toAttentionRow(r: RawAttention): AttentionRow {
  return {
    kind: r.kind as AttentionRow["kind"],
    targetId: r.target_id,
    capsuleId: r.capsule_id,
    capsuleKey: r.capsule_key,
    capsuleName: r.capsule_name,
    componentId: r.component_id,
    componentName: r.component_name,
    componentColor: r.component_color as ComponentColor | null,
    componentIcon: r.component_icon,
    title: r.title,
    dueDate: r.due_date,
    since: r.since,
    actorId: r.actor_id,
    body: r.body,
  };
}

/** Overdue first, then due soonest, then the newest (build-decisions.md, step 8 plan). */
export function sortAttention(rows: AttentionRow[]): AttentionRow[] {
  return [...rows].sort(
    (a, b) =>
      (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || b.since.localeCompare(a.since),
  );
}

/** Where "Open" goes: the capsule, with this exact item, component or comment selected. */
export function attentionHref(r: AttentionRow): string {
  const base = `/capsules/${r.capsuleKey.toLowerCase()}`;
  if (r.kind === "item") return `${base}?item=${r.targetId}`;
  if (r.kind === "piece") return `${base}?piece=${r.targetId}`;
  if (r.kind === "mention") return `${base}?activity=1`;
  return `${base}?component=${r.componentId}`;
}

/** Stable key for a row. */
export const attentionKey = (r: Pick<AttentionRow, "kind" | "targetId">) =>
  `${r.kind}:${r.targetId}`;
