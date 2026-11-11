import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ComponentColor } from "@/lib/design";
import type { JoinCapsule, JoinComponent, JoinSpace, JoinState } from "./types";

type Invitation = {
  org_id: string;
  org_name: string;
  invited_by: string;
  components: JoinComponent[];
};

/** Everything the invited person's flow needs, for the signed-in person. */
export async function loadJoin(): Promise<JoinState | null> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string;
  const email = (claims?.claims?.email as string) ?? "";
  const { data: me } = await supabase.from("users").select("name").eq("id", userId).single();
  const yourName = me?.name ?? "";

  const { data: membership } = await supabase
    .from("org_members")
    .select("org_id, usual_component_type_ids, orgs(name)")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (!membership) {
    const { data } = await supabase.rpc("my_invitation");
    const inv = data as Invitation | null;
    if (!inv) return null;
    return {
      stage: "invited",
      email,
      yourName,
      orgId: null,
      orgName: inv.org_name,
      invitedBy: inv.invited_by,
      components: inv.components,
      areas: [],
      spaces: [],
    };
  }

  const orgId = membership.org_id;
  const orgName = (membership.orgs as unknown as { name: string } | null)?.name ?? "";

  const [components, spaces, invitedBy] = await Promise.all([
    supabase
      .from("component_types")
      .select("id, name, color, icon")
      .eq("org_id", orgId)
      .is("archived_at", null)
      .order("position"),
    loadSpaces(userId, orgId),
    supabase
      .from("invitations")
      .select("invited_by")
      .eq("org_id", orgId)
      .eq("email", email.toLowerCase())
      .not("accepted_at", "is", null)
      .order("accepted_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const inviterId = invitedBy.data?.invited_by;
  const { data: inviter } = inviterId
    ? await supabase.from("users").select("name, email").eq("id", inviterId).maybeSingle()
    : { data: null };

  return {
    stage: "joining",
    email,
    yourName,
    orgId,
    orgName,
    invitedBy: inviter?.name || inviter?.email || "Your team",
    components: (components.data ?? []).map((c) => ({ ...c, color: c.color as ComponentColor })),
    areas: membership.usual_component_type_ids ?? [],
    spaces,
  };
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** The org's spaces, and in each, the capsules that already have something for this person. */
async function loadSpaces(userId: string, orgId: string): Promise<JoinSpace[]> {
  const supabase = await createClient();
  const [spaces, owned, ownedComponents, items] = await Promise.all([
    supabase
      .from("spaces")
      .select("id, name, key_prefix, description, space_members(user_id)")
      .eq("org_id", orgId)
      .order("name"),
    supabase.from("capsules").select("id").eq("owner_id", userId).is("archived_at", null),
    supabase
      .from("components")
      .select("capsule_id, status, component_types(name)")
      .eq("owner_id", userId),
    supabase.from("work_items").select("capsule_id").eq("assignee_id", userId).eq("done", false),
  ]);

  const byCapsule = new Map<string, { parts: string[]; items: number; needs: number }>();
  const entry = (id: string) => {
    if (!byCapsule.has(id)) byCapsule.set(id, { parts: [], items: 0, needs: 0 });
    return byCapsule.get(id)!;
  };
  for (const c of owned.data ?? []) entry(c.id).parts.push("Capsule owner");
  for (const c of ownedComponents.data ?? []) {
    const e = entry(c.capsule_id);
    e.parts.push(
      `${(c.component_types as unknown as { name: string } | null)?.name ?? "Component"} owner`,
    );
    if (c.status !== "done") e.needs += 1;
  }
  for (const w of items.data ?? []) {
    const e = entry(w.capsule_id);
    e.items += 1;
    e.needs += 1;
  }

  const ids = [...byCapsule.keys()];
  const { data: capsules } = ids.length
    ? await supabase.from("capsules").select("id, name, space_id").in("id", ids)
    : { data: [] as { id: string; name: string; space_id: string }[] };

  return (spaces.data ?? []).map((s) => {
    const members = (s.space_members as { user_id: string }[] | null) ?? [];
    const here: JoinCapsule[] = (capsules ?? [])
      .filter((c) => c.space_id === s.id)
      .map((c) => {
        const e = byCapsule.get(c.id)!;
        const parts = [...e.parts];
        if (e.items) parts.push(`${plural(e.items, "work item")} assigned to you`);
        return { id: c.id, name: c.name, role: parts.join(" · "), needs: e.needs };
      });
    return {
      id: s.id,
      name: s.name,
      keyPrefix: s.key_prefix,
      description: s.description,
      members: members.length,
      joined: members.some((m) => m.user_id === userId),
      capsules: here,
    };
  });
}
