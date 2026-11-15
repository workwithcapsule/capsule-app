"use server";

import { createClient } from "@/lib/supabase/server";

/** One search result: a capsule you can see (build-decisions.md 49). */
export type SearchHit = {
  key: string;
  name: string;
  space: string;
  /** You're on its team or follow it; otherwise you can only view it. */
  yours: boolean;
};

type Row = {
  id: string;
  number: number;
  name: string;
  updated_at: string;
  spaces: { key_prefix: string; name: string } | null;
};

const SELECT = "id, number, name, updated_at, spaces(key_prefix, name)";

async function yoursSet(userId: string) {
  const supabase = await createClient();
  const [owned, comps, collab, follows] = await Promise.all([
    supabase.from("capsules").select("id").eq("owner_id", userId),
    supabase.from("components").select("capsule_id").eq("owner_id", userId),
    supabase.from("component_people").select("capsule_id").eq("user_id", userId),
    supabase.from("followers").select("capsule_id").eq("user_id", userId),
  ]);
  return new Set<string>([
    ...(owned.data ?? []).map((r) => r.id),
    ...(comps.data ?? []).map((r) => r.capsule_id),
    ...(collab.data ?? []).map((r) => r.capsule_id),
    ...(follows.data ?? []).map((r) => r.capsule_id),
  ]);
}

const toHit = (r: Row, yours: Set<string>): SearchHit => ({
  key: `${r.spaces?.key_prefix ?? ""}-${r.number}`,
  name: r.name,
  space: r.spaces?.name ?? "",
  yours: yours.has(r.id),
});

/**
 * Capsules matching a name or a key ("EN-1", "en 1", "EN"). Runs as the
 * signed-in person, so it only finds capsules they can see. With nothing
 * typed, it returns their most recently updated capsules.
 */
export async function searchCapsules(query: string): Promise<SearchHit[]> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) return [];
  const yours = await yoursSet(userId);
  const q = query.trim().slice(0, 100);

  if (!q) {
    if (!yours.size) return [];
    const { data } = await supabase
      .from("capsules")
      .select(SELECT)
      .in("id", [...yours])
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(7);
    return ((data ?? []) as unknown as Row[]).map((r) => toHit(r, yours));
  }

  const found = new Map<string, Row>();
  // A key: letters, then optionally a number ("EN-12", "en 12", "EN").
  const key = /^([a-z]{2,4})(?:[\s-]*(\d{1,9}))?$/i.exec(q);
  if (key) {
    const { data: spaces } = await supabase
      .from("spaces")
      .select("id")
      .eq("key_prefix", key[1].toUpperCase());
    const ids = (spaces ?? []).map((s) => s.id);
    if (ids.length) {
      let byKey = supabase
        .from("capsules")
        .select(SELECT)
        .in("space_id", ids)
        .is("archived_at", null)
        .order("number")
        .limit(10);
      if (key[2]) byKey = byKey.eq("number", Number(key[2]));
      const { data } = await byKey;
      for (const r of (data ?? []) as unknown as Row[]) found.set(r.id, r);
    }
  }
  // Names: every word typed must appear.
  const words = q.split(/\s+/).filter(Boolean).slice(0, 5);
  let byName = supabase.from("capsules").select(SELECT).is("archived_at", null).limit(20);
  for (const w of words) byName = byName.ilike("name", `%${w.replace(/[%_\\]/g, "\\$&")}%`);
  const { data: named } = await byName;
  for (const r of (named ?? []) as unknown as Row[]) found.set(r.id, r);

  // Yours first, then the most recently updated.
  return [...found.values()]
    .sort(
      (a, b) =>
        Number(yours.has(b.id)) - Number(yours.has(a.id)) ||
        b.updated_at.localeCompare(a.updated_at),
    )
    .slice(0, 8)
    .map((r) => toHit(r, yours));
}
