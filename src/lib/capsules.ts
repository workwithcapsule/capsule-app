import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ComponentColor, Status } from "@/lib/design";
import type { CapsuleData, PersonRef } from "@/lib/capsule-types";

const initialsOf = (name: string) => name.trim().charAt(0).toUpperCase() || "?";

/** Splits a key like "EN-12" into its prefix and number. */
export function parseKey(key: string): { prefix: string; number: number } | null {
  const m = /^([A-Za-z]{2,4})-(\d{1,9})$/.exec(key.trim());
  return m ? { prefix: m[1].toUpperCase(), number: Number(m[2]) } : null;
}

/** The org's people, for names and pickers. */
export async function loadPeople(orgId: string): Promise<PersonRef[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("org_members")
    .select("user_id, users(name, email)")
    .eq("org_id", orgId);
  return (data ?? [])
    .map((m) => {
      const u = m.users as unknown as { name: string | null; email: string } | null;
      const name = u?.name?.trim() || u?.email || "Someone";
      return { id: m.user_id, name, initials: initialsOf(name) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Everything the capsule page needs, or null if it doesn't exist or this person can't see it. */
export async function loadCapsule(key: string): Promise<CapsuleData | null> {
  const parsed = parseKey(key);
  if (!parsed) return null;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) return null;

  const { data: space } = await supabase
    .from("spaces")
    .select("id, name, key_prefix, org_id")
    .eq("key_prefix", parsed.prefix)
    .maybeSingle();
  if (!space) return null;

  const { data: cap } = await supabase
    .from("capsules")
    .select("id, org_id, number, name, outcome, status, launch_date, date_type, owner_id")
    .eq("space_id", space.id)
    .eq("number", parsed.number)
    .maybeSingle();
  if (!cap) return null;

  const [components, items, collaborators, people, types] = await Promise.all([
    supabase
      .from("components")
      .select(
        "id, component_type_id, owner_id, due_date, status, goal, position, component_types(name, color, icon)",
      )
      .eq("capsule_id", cap.id)
      .order("position"),
    supabase
      .from("work_items")
      .select("id, component_id, title, done, assignee_id, created_by, position, created_at")
      .eq("capsule_id", cap.id)
      .order("position")
      .order("created_at"),
    supabase
      .from("component_people")
      .select("component_id, user_id, source")
      .eq("capsule_id", cap.id),
    loadPeople(cap.org_id),
    supabase
      .from("component_types")
      .select("id, name, color, icon, description")
      .eq("org_id", cap.org_id)
      .is("archived_at", null)
      .order("position"),
  ]);

  const me = people.find((p) => p.id === userId) ?? { id: userId, name: "You", initials: "Y" };

  return {
    capsule: {
      id: cap.id,
      orgId: cap.org_id,
      key: `${space.key_prefix}-${cap.number}`,
      name: cap.name,
      outcome: cap.outcome,
      status: cap.status as Status,
      launchDate: cap.launch_date,
      dateType: cap.date_type as "launch" | "due",
      ownerId: cap.owner_id,
      space: { id: space.id, name: space.name, keyPrefix: space.key_prefix },
    },
    components: (components.data ?? []).map((c) => {
      const t = c.component_types as unknown as {
        name: string;
        color: string;
        icon: string | null;
      } | null;
      return {
        id: c.id,
        typeId: c.component_type_id,
        name: t?.name ?? "Component",
        color: (t?.color ?? "gray") as ComponentColor,
        icon: t?.icon ?? null,
        ownerId: c.owner_id,
        dueDate: c.due_date,
        status: c.status as Status,
        goal: c.goal,
        position: c.position,
        collaborators: (collaborators.data ?? [])
          .filter((p) => p.component_id === c.id)
          .map((p) => ({ userId: p.user_id, source: p.source as "added" | "assignment" })),
      };
    }),
    items: (items.data ?? []).map((i) => ({
      id: i.id,
      componentId: i.component_id,
      title: i.title,
      done: i.done,
      assigneeId: i.assignee_id,
      createdBy: i.created_by,
      position: i.position,
    })),
    people,
    componentTypes: (types.data ?? []).map((t) => ({ ...t, color: t.color as ComponentColor })),
    me,
  };
}
