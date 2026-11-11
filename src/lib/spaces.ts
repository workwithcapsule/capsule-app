import "server-only";
import { createClient } from "@/lib/supabase/server";

export type Person = { id: string; name: string; initials: string };

export type SpaceSummary = {
  id: string;
  name: string;
  keyPrefix: string;
  description: string | null;
  members: Person[];
  joined: boolean;
  /** "admin" if this person manages the space through membership. */
  myRole: "admin" | "member" | null;
  canManage: boolean;
  capsuleCount: number;
};

export type SpacesDirectory = {
  orgId: string;
  orgName: string;
  userId: string;
  me: Person;
  spaces: SpaceSummary[];
};

export const initialsOf = (name: string) => name.trim().charAt(0).toUpperCase() || "?";

/** Every space the signed-in person can see in their org, with members and capsule counts. */
export async function loadSpacesDirectory(): Promise<SpacesDirectory | null> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) return null;

  const { data: membership } = await supabase
    .from("org_members")
    .select("org_id, role, orgs(name)")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (!membership) return null;
  const orgId = membership.org_id;
  const isOrgAdmin = membership.role === "admin";

  const [{ data: spaces }, { data: capsules }, { data: people }] = await Promise.all([
    supabase
      .from("spaces")
      .select(
        "id, name, key_prefix, description, created_by, space_members(user_id, role, created_at)",
      )
      .eq("org_id", orgId)
      .order("name"),
    supabase.from("capsules").select("space_id").eq("org_id", orgId).is("archived_at", null),
    supabase.from("org_members").select("user_id, users(name, email)").eq("org_id", orgId),
  ]);

  const names = new Map(
    (people ?? []).map((p) => {
      const u = p.users as unknown as { name: string | null; email: string } | null;
      return [p.user_id, u?.name?.trim() || u?.email || "Someone"];
    }),
  );
  const counts = new Map<string, number>();
  for (const c of capsules ?? []) counts.set(c.space_id, (counts.get(c.space_id) ?? 0) + 1);

  return {
    orgId,
    orgName: (membership.orgs as unknown as { name: string } | null)?.name ?? "",
    userId,
    me: {
      id: userId,
      name: names.get(userId) ?? "You",
      initials: initialsOf(names.get(userId) ?? "You"),
    },
    spaces: (spaces ?? []).map((s) => {
      const rows = (
        (s.space_members as { user_id: string; role: string; created_at: string }[]) ?? []
      )
        .slice()
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
      const mine = rows.find((m) => m.user_id === userId);
      const myRole = (mine?.role as "admin" | "member" | undefined) ?? null;
      return {
        id: s.id,
        name: s.name,
        keyPrefix: s.key_prefix,
        description: s.description,
        members: rows.map((m) => {
          const name = names.get(m.user_id) ?? "Someone";
          return { id: m.user_id, name, initials: initialsOf(name) };
        }),
        joined: Boolean(mine),
        myRole,
        canManage: isOrgAdmin || s.created_by === userId || myRole === "admin",
        capsuleCount: counts.get(s.id) ?? 0,
      };
    }),
  };
}

export type SpaceCapsule = {
  id: string;
  key: string;
  name: string;
  status: "not_started" | "in_progress" | "in_review" | "done" | "blocked";
  owner: Person | null;
};

export type SpacePage = SpaceSummary & { capsules: SpaceCapsule[]; orgName: string; me: Person };

/** One space, by key prefix, with its members and the capsules in it this person can see. */
export async function loadSpacePage(key: string): Promise<SpacePage | null> {
  const directory = await loadSpacesDirectory();
  const space = directory?.spaces.find((s) => s.keyPrefix.toLowerCase() === key.toLowerCase());
  if (!directory || !space) return null;

  const supabase = await createClient();
  const [{ data: capsules }, { data: people }] = await Promise.all([
    supabase
      .from("capsules")
      .select("id, number, name, status, owner_id")
      .eq("space_id", space.id)
      .is("archived_at", null)
      .order("number", { ascending: false }),
    supabase
      .from("org_members")
      .select("user_id, users(name, email)")
      .eq("org_id", directory.orgId),
  ]);
  const names = new Map(
    (people ?? []).map((p) => {
      const u = p.users as unknown as { name: string | null; email: string } | null;
      return [p.user_id, u?.name?.trim() || u?.email || "Someone"];
    }),
  );

  return {
    ...space,
    orgName: directory.orgName,
    me: directory.me,
    capsules: (capsules ?? []).map((c) => {
      const ownerName = c.owner_id ? names.get(c.owner_id) : null;
      return {
        id: c.id,
        key: `${space.keyPrefix}-${c.number}`,
        name: c.name,
        status: c.status as SpaceCapsule["status"],
        owner:
          c.owner_id && ownerName
            ? { id: c.owner_id, name: ownerName, initials: initialsOf(ownerName) }
            : null,
      };
    }),
  };
}
