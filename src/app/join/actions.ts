"use server";

import { createClient } from "@/lib/supabase/server";
import { loadJoin } from "./data";
import type { JoinState } from "./types";

/* The invited person's actions. The database's access rules decide what's allowed. */

type Result = { ok: true; state?: JoinState | null } | { ok: false; error: string };
const SOMETHING_WRONG = "Something went wrong saving this. Try again.";

async function session() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return { supabase, userId: data?.claims?.sub as string | undefined };
}

/** Step 1, first time: accept the invitation, saving name and usual areas. */
export async function acceptInvitation(yourName: string, areas: string[]): Promise<Result> {
  if (!yourName.trim()) return { ok: false, error: "Enter your name." };
  const { supabase } = await session();
  const { error } = await supabase.rpc("accept_invitation", {
    p_your_name: yourName.trim(),
    p_component_type_ids: areas,
  });
  if (error) return { ok: false, error: error.code === "42501" ? error.message : SOMETHING_WRONG };
  return { ok: true, state: await loadJoin() };
}

/** Step 1, coming back: update name and usual areas. */
export async function updateProfile(
  orgId: string,
  yourName: string,
  areas: string[],
): Promise<Result> {
  if (!yourName.trim()) return { ok: false, error: "Enter your name." };
  const { supabase, userId } = await session();
  if (!userId) return { ok: false, error: "Your session ended. Sign in again." };
  const [a, b] = await Promise.all([
    supabase.from("users").update({ name: yourName.trim() }).eq("id", userId),
    supabase
      .from("org_members")
      .update({ usual_component_type_ids: areas })
      .eq("org_id", orgId)
      .eq("user_id", userId),
  ]);
  if (a.error || b.error) return { ok: false, error: SOMETHING_WRONG };
  return { ok: true };
}

/** Join or leave a public space. */
export async function setSpaceMembership(
  orgId: string,
  spaceId: string,
  join: boolean,
): Promise<Result> {
  const { supabase, userId } = await session();
  if (!userId) return { ok: false, error: "Your session ended. Sign in again." };
  const { error } = join
    ? await supabase
        .from("space_members")
        .insert({ org_id: orgId, space_id: spaceId, user_id: userId })
    : await supabase.from("space_members").delete().eq("space_id", spaceId).eq("user_id", userId);
  return error ? { ok: false, error: SOMETHING_WRONG } : { ok: true };
}

/** Finish: from now on this person lands on Home. */
export async function finishJoining(orgId: string): Promise<Result> {
  const { supabase, userId } = await session();
  if (!userId) return { ok: false, error: "Your session ended. Sign in again." };
  const { error } = await supabase
    .from("org_members")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .eq("user_id", userId);
  return error ? { ok: false, error: SOMETHING_WRONG } : { ok: true };
}
