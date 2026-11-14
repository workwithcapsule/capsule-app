import "server-only";
import type { ActivityEvent } from "@/lib/activity";
import { sortAttention, toAttentionRow, type AttentionRow } from "@/lib/attention";
import type { PersonRef } from "@/lib/capsule-types";
import { loadPeople } from "@/lib/capsules";
import { createClient } from "@/lib/supabase/server";

export type HomeCapsule = { id: string; key: string; name: string; followerOnly: boolean };

export type HomeData = {
  me: PersonRef;
  orgId: string;
  people: PersonRef[];
  attention: AttentionRow[];
  /** Capsules you're on or follow, with their activity from the last day and a half. */
  capsules: HomeCapsule[];
  events: (ActivityEvent & { capsuleId: string })[];
};

/** Needs your attention for the signed-in person (also used for the sidebar count). */
export async function loadAttention(): Promise<AttentionRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("needs_attention");
  return sortAttention((data ?? []).map(toAttentionRow));
}

export async function loadHome(): Promise<HomeData | null> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) return null;
  const { data: membership } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (!membership) return null;

  // Capsules you're on (owner, component owner, collaborator) or follow.
  const [owned, ownsComponent, collaborates, follows, attention, people] = await Promise.all([
    supabase.from("capsules").select("id").eq("owner_id", userId),
    supabase.from("components").select("capsule_id").eq("owner_id", userId),
    supabase.from("component_people").select("capsule_id").eq("user_id", userId),
    supabase.from("followers").select("capsule_id").eq("user_id", userId),
    loadAttention(),
    loadPeople(membership.org_id),
  ]);
  const team = new Set<string>([
    ...(owned.data ?? []).map((r) => r.id),
    ...(ownsComponent.data ?? []).map((r) => r.capsule_id),
    ...(collaborates.data ?? []).map((r) => r.capsule_id),
  ]);
  const followed = new Set((follows.data ?? []).map((r) => r.capsule_id));
  const ids = [...new Set([...team, ...followed])];

  let capsules: HomeCapsule[] = [];
  let events: HomeData["events"] = [];
  if (ids.length) {
    // "Today" is decided in the browser (its own time zone), so fetch a little more.
    const since = new Date(Date.now() - 36 * 3_600_000).toISOString();
    const [caps, evs] = await Promise.all([
      supabase
        .from("capsules")
        .select("id, number, name, spaces(key_prefix)")
        .in("id", ids)
        .is("archived_at", null),
      supabase
        .from("events")
        .select("id, capsule_id, kind, actor_user_id, data, created_at")
        .in("capsule_id", ids)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);
    capsules = (caps.data ?? []).map((c) => ({
      id: c.id,
      key: `${(c.spaces as unknown as { key_prefix: string }).key_prefix}-${c.number}`,
      name: c.name,
      followerOnly: !team.has(c.id),
    }));
    events = (evs.data ?? []).map((e) => ({
      id: e.id,
      capsuleId: e.capsule_id,
      kind: e.kind,
      actorId: e.actor_user_id,
      data: (e.data ?? {}) as Record<string, unknown>,
      at: e.created_at,
    }));
  }

  const me = people.find((p) => p.id === userId) ?? { id: userId, name: "You", initials: "Y" };
  return { me, orgId: membership.org_id, people, attention, capsules, events };
}
