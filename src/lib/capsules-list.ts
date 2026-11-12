import "server-only";
import { createClient } from "@/lib/supabase/server";
import { loadPeople } from "@/lib/capsules";
import type { Status } from "@/lib/design";
import type { PersonRef } from "@/lib/capsule-types";

export type CapsuleRow = {
  id: string;
  key: string;
  name: string;
  status: Status;
  launchDate: string | null;
  space: { id: string; name: string };
  owner: PersonRef | null;
  componentStatuses: { name: string; status: Status }[];
  /** How this person relates to it (prototype filters). */
  created: boolean;
  working: boolean;
  following: boolean;
  /** Things waiting on this person here: their open work items, components they own that
   * aren't done, and components with no owner on capsules they own. */
  needs: number;
  updatedAt: string;
};

export type CapsulesList = { rows: CapsuleRow[]; spaces: { id: string; name: string }[] };

/** Capsules the signed-in person created, works on or follows. */
export async function loadCapsulesList(): Promise<CapsulesList | null> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims?.sub as string | undefined;
  if (!me) return null;
  const { data: membership } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", me)
    .limit(1)
    .maybeSingle();
  if (!membership) return null;
  const orgId = membership.org_id;

  const [caps, comps, collaborators, items, follows, spaces, people] = await Promise.all([
    supabase
      .from("capsules")
      .select("id, number, name, status, launch_date, owner_id, created_by, updated_at, space_id")
      .eq("org_id", orgId)
      .is("archived_at", null),
    supabase
      .from("components")
      .select("capsule_id, owner_id, status, updated_at, position, component_types(name)")
      .eq("org_id", orgId),
    supabase
      .from("component_people")
      .select("capsule_id, user_id")
      .eq("org_id", orgId)
      .eq("user_id", me),
    supabase
      .from("work_items")
      .select("capsule_id, assignee_id, done, updated_at")
      .eq("org_id", orgId),
    supabase.from("followers").select("capsule_id").eq("user_id", me),
    supabase.from("spaces").select("id, name, key_prefix").eq("org_id", orgId).order("name"),
    loadPeople(orgId),
  ]);

  const spaceById = new Map((spaces.data ?? []).map((s) => [s.id, s]));
  const personById = new Map(people.map((p) => [p.id, p]));
  const followed = new Set((follows.data ?? []).map((f) => f.capsule_id));
  const onComponent = new Set((collaborators.data ?? []).map((c) => c.capsule_id));

  const rows: CapsuleRow[] = [];
  for (const c of caps.data ?? []) {
    const myComps = (comps.data ?? [])
      .filter((k) => k.capsule_id === c.id)
      .sort((a, b) => a.position - b.position);
    const myItems = (items.data ?? []).filter((i) => i.capsule_id === c.id);
    const isOwner = c.owner_id === me;
    const working = isOwner || myComps.some((k) => k.owner_id === me) || onComponent.has(c.id);
    const created = c.created_by === me;
    const following = followed.has(c.id);
    if (!created && !working && !following) continue;

    const needs =
      myItems.filter((i) => i.assignee_id === me && !i.done).length +
      myComps.filter((k) => k.owner_id === me && k.status !== "done").length +
      (isOwner ? myComps.filter((k) => !k.owner_id).length : 0);
    const updatedAt = [
      c.updated_at,
      ...myComps.map((k) => k.updated_at),
      ...myItems.map((i) => i.updated_at),
    ]
      .sort()
      .pop()!;
    const space = spaceById.get(c.space_id);

    rows.push({
      id: c.id,
      key: `${space?.key_prefix ?? "??"}-${c.number}`,
      name: c.name,
      status: c.status as Status,
      launchDate: c.launch_date,
      space: { id: c.space_id, name: space?.name ?? "" },
      owner: c.owner_id ? (personById.get(c.owner_id) ?? null) : null,
      componentStatuses: myComps.map((k) => ({
        name: (k.component_types as unknown as { name: string } | null)?.name ?? "",
        status: k.status as Status,
      })),
      created,
      working,
      following,
      needs,
      updatedAt,
    });
  }

  return { rows, spaces: (spaces.data ?? []).map((s) => ({ id: s.id, name: s.name })) };
}
