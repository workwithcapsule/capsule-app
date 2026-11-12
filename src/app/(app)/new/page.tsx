import type { Metadata } from "next";
import { Suspense } from "react";
import { loadPeople } from "@/lib/capsules";
import type { ComponentColor } from "@/lib/design";
import { loadSpacesDirectory } from "@/lib/spaces";
import { createClient } from "@/lib/supabase/server";
import { NewCapsuleForm } from "./new-capsule-form";

export const metadata: Metadata = { title: "New capsule" };

async function Form({ searchParams }: { searchParams: PageProps<"/new">["searchParams"] }) {
  const directory = await loadSpacesDirectory();
  if (!directory) return null;
  const supabase = await createClient();
  const [people, { data: types }, params] = await Promise.all([
    loadPeople(directory.orgId),
    supabase
      .from("component_types")
      .select("id, name, color, icon, description")
      .eq("org_id", directory.orgId)
      .is("archived_at", null)
      .order("position"),
    searchParams,
  ]);
  // Spaces you've joined first, then the rest, alphabetical within each.
  const spaces = [...directory.spaces]
    .sort((a, b) => Number(b.joined) - Number(a.joined) || a.name.localeCompare(b.name))
    .map((s) => ({ id: s.id, name: s.name, keyPrefix: s.keyPrefix, joined: s.joined }));
  const wanted = typeof params.space === "string" ? params.space.toUpperCase() : null;

  return (
    <NewCapsuleForm
      spaces={spaces}
      people={people}
      types={(types ?? []).map((t) => ({ ...t, color: t.color as ComponentColor }))}
      me={directory.me}
      defaultSpaceId={spaces.find((s) => s.keyPrefix === wanted)?.id ?? null}
    />
  );
}

export default function NewCapsulePage({ searchParams }: PageProps<"/new">) {
  return (
    <Suspense>
      <Form searchParams={searchParams} />
    </Suspense>
  );
}
