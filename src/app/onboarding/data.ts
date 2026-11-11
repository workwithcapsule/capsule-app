import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ComponentColor } from "@/lib/design";
import type { OnboardingState } from "./types";

/** Everything onboarding needs, for the signed-in person. */
export async function loadOnboarding(): Promise<OnboardingState> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string;
  const email = (claims?.claims?.email as string) ?? "";

  const { data: me } = await supabase.from("users").select("name").eq("id", userId).single();
  const { data: membership } = await supabase
    .from("org_members")
    .select("org_id, orgs(id, name, onboarding_step)")
    .eq("user_id", userId)
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();

  const orgRow = membership?.orgs as unknown as {
    id: string;
    name: string;
    onboarding_step: number;
  } | null;
  if (!orgRow) {
    return { email, yourName: me?.name ?? "", org: null, components: [], spaces: [], invites: [] };
  }

  const [{ data: comps }, { data: spaces }, { data: invites }] = await Promise.all([
    supabase
      .from("component_types")
      .select("id, name, description, color, icon")
      .eq("org_id", orgRow.id)
      .is("archived_at", null)
      .order("position"),
    supabase
      .from("spaces")
      .select("id, name, key_prefix")
      .eq("org_id", orgRow.id)
      .order("created_at"),
    supabase
      .from("invitations")
      .select("email")
      .eq("org_id", orgRow.id)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("created_at"),
  ]);

  return {
    email,
    yourName: me?.name ?? "",
    org: { id: orgRow.id, name: orgRow.name, step: orgRow.onboarding_step },
    components: (comps ?? []).map((c) => ({
      id: c.id,
      key: c.id,
      name: c.name,
      description: c.description ?? "",
      color: c.color as ComponentColor,
      icon: c.icon ?? "box",
    })),
    spaces: (spaces ?? []).map((s) => ({
      id: s.id,
      key: s.id,
      name: s.name,
      prefix: s.key_prefix,
    })),
    invites: (invites ?? []).map((i) => i.email),
  };
}
