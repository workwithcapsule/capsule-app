/*
 * What Claude knows when shaping: the org's components, spaces and people
 * (with their usual areas), a few recent capsules as examples, and today's
 * date. Everything gets a short ref (c1, s1, p1) so the answer can be mapped
 * back and checked exactly.
 */

export type ShapingContext = {
  today: string; // YYYY-MM-DD
  me: string; // the asking person's id
  components: { ref: string; id: string; name: string; description: string | null }[];
  spaces: {
    ref: string;
    id: string;
    name: string;
    keyPrefix: string;
    description: string | null;
    joined: boolean;
  }[];
  people: { ref: string; id: string; name: string; usual: string[] }[];
  recent: { name: string; space: string; components: string[] }[];
};

export type RawContext = {
  today: string;
  me: string;
  types: { id: string; name: string; description: string | null }[];
  spaces: {
    id: string;
    name: string;
    keyPrefix: string;
    description: string | null;
    joined: boolean;
  }[];
  people: { id: string; name: string; usualTypeIds: string[] }[];
  recent: { name: string; space: string; components: string[] }[];
};

export function buildContext(raw: RawContext): ShapingContext {
  const typeName = new Map(raw.types.map((t) => [t.id, t.name]));
  return {
    today: raw.today,
    me: raw.me,
    components: raw.types.map((t, i) => ({ ref: `c${i + 1}`, ...t })),
    spaces: raw.spaces.map((s, i) => ({ ref: `s${i + 1}`, ...s })),
    // The asking person first, so they're p1.
    people: [...raw.people]
      .sort((a, b) => Number(b.id === raw.me) - Number(a.id === raw.me))
      .map((p, i) => ({
        ref: `p${i + 1}`,
        id: p.id,
        name: p.name,
        usual: p.usualTypeIds.map((id) => typeName.get(id)).filter((n): n is string => !!n),
      })),
    recent: raw.recent,
  };
}

const weekday = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });

/** The request text Claude reads: the org's details, then the description. */
export function contextMessage(ctx: ShapingContext, description: string): string {
  const me = ctx.people.find((p) => p.id === ctx.me);
  const lines = [
    `Today is ${weekday(ctx.today)}, ${ctx.today}.`,
    `The person asking: ${me ? `${me.name} (${me.ref})` : "unknown"}.`,
    "",
    "Components in this organization (use only these refs):",
    ...ctx.components.map(
      (c) => `- ${c.ref}: ${c.name}${c.description ? ` (${c.description})` : ""}`,
    ),
    "",
    "Spaces:",
    ...ctx.spaces.map(
      (s) =>
        `- ${s.ref}: ${s.name} [${s.keyPrefix}]${s.description ? ` (${s.description})` : ""}${
          s.joined ? ", joined by the person asking" : ""
        }`,
    ),
    "",
    "People (usual areas in brackets):",
    ...ctx.people.map(
      (p) => `- ${p.ref}: ${p.name}${p.usual.length ? ` [${p.usual.join(", ")}]` : ""}`,
    ),
  ];
  if (ctx.recent.length) {
    lines.push(
      "",
      "Recent capsules in this organization, for a sense of how they work:",
      ...ctx.recent.map(
        (r) => `- "${r.name}" (${r.space}): ${r.components.join(", ") || "no components"}`,
      ),
    );
  }
  lines.push(
    "",
    "The description, from the person asking:",
    "<description>",
    description,
    "</description>",
  );
  return lines.join("\n");
}
