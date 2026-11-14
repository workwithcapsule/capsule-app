import type { ShapingContext } from "./context";
import type { ShapeOutput } from "./schema";
import type { ShapedDraft } from "./types";

/*
 * Checks Claude's answer against the org before anyone sees it: only the
 * org's own components, spaces and people, real dates, sensible lengths.
 * Anything that doesn't fit is dropped or left blank, never invented.
 */

const MAX_COMPONENTS = 8;
const MAX_ITEMS = 6;

const clip = (s: string | null | undefined, max: number) => (s ?? "").trim().slice(0, max).trim();

/** A real calendar date as YYYY-MM-DD, or null. */
export function realDate(v: string | null | undefined): string | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null;
}

/** First few words of the description, for when the name comes back empty. */
function nameFrom(description: string) {
  const words = description.replace(/\s+/g, " ").trim().split(" ").slice(0, 6).join(" ");
  const clean = words.replace(/[.,!?;:]+$/, "");
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

export function toDraft(out: ShapeOutput, ctx: ShapingContext, description: string): ShapedDraft {
  const person = new Map(ctx.people.map((p) => [p.ref, p.id]));
  const component = new Map(ctx.components.map((c) => [c.ref, c.id]));
  const space = new Map(ctx.spaces.map((s) => [s.ref, s.id]));
  const ref = (map: Map<string, string>, r: string | null | undefined) =>
    r ? (map.get(r.trim().toLowerCase()) ?? null) : null;

  // Dates in the past make no sense for a new capsule.
  const future = (v: string | null | undefined) => {
    const d = realDate(v);
    return d && d >= ctx.today ? d : null;
  };
  const launchDate = future(out.launch_date);

  const seen = new Set<string>();
  const components: ShapedDraft["components"] = [];
  for (const c of out.components ?? []) {
    const typeId = ref(component, c.component);
    if (!typeId || seen.has(typeId) || components.length >= MAX_COMPONENTS) continue;
    seen.add(typeId);
    let due = future(c.due_date);
    // Component dates stay on or before the launch date.
    if (due && launchDate && due > launchDate) due = launchDate;
    components.push({
      typeId,
      ownerId: ref(person, c.owner),
      dueDate: due,
      goal: clip(c.goal, 200),
      items: (c.work_items ?? [])
        .map((i) => ({ title: clip(i.title, 500), assigneeId: ref(person, i.assignee) }))
        .filter((i) => i.title)
        .slice(0, MAX_ITEMS),
    });
  }

  return {
    name: clip(out.name, 200) || nameFrom(description),
    outcome: clip(out.outcome, 1000) || clip(description, 1000),
    spaceId: ref(space, out.space),
    launchDate,
    dateType: out.date_type === "due" ? "due" : "launch",
    ownerId: ref(person, out.owner) ?? ctx.me,
    components,
    note: clip(out.note, 300) || null,
  };
}
