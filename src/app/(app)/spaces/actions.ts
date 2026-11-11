"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { prefixError } from "@/lib/validation";

/* Space actions. The database's access rules decide who may do what. */

type Result = { ok: true } | { ok: false; error: string };
const SOMETHING_WRONG = "Something went wrong. Try again.";

async function session() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  const { data: m } = userId
    ? await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle()
    : { data: null };
  return { supabase, userId, orgId: m?.org_id as string | undefined };
}

const refresh = () => revalidatePath("/", "layout"); // sidebar's Your spaces too

/** Join a public space. `role` is only used by Undo, to restore a manager's role. */
export async function joinSpace(
  spaceId: string,
  role: "member" | "admin" = "member",
): Promise<Result> {
  const { supabase, userId, orgId } = await session();
  if (!userId || !orgId) return { ok: false, error: "Your session ended. Sign in again." };
  const { error } = await supabase
    .from("space_members")
    .insert({ org_id: orgId, space_id: spaceId, user_id: userId, role });
  if (error && error.code !== "23505") return { ok: false, error: SOMETHING_WRONG };
  refresh();
  return { ok: true };
}

export async function leaveSpace(spaceId: string): Promise<Result> {
  const { supabase, userId } = await session();
  if (!userId) return { ok: false, error: "Your session ended. Sign in again." };
  const { error } = await supabase
    .from("space_members")
    .delete()
    .eq("space_id", spaceId)
    .eq("user_id", userId);
  if (error) return { ok: false, error: SOMETHING_WRONG };
  refresh();
  return { ok: true };
}

export async function createSpace(input: {
  name: string;
  prefix: string;
  description: string;
}): Promise<Result & { keyPrefix?: string }> {
  const name = input.name.trim();
  const prefix = input.prefix.trim().toUpperCase();
  if (!name) return { ok: false, error: "Give the space a name." };
  const err = prefixError(prefix, []);
  if (err) return { ok: false, error: err };

  const { supabase, userId, orgId } = await session();
  if (!userId || !orgId) return { ok: false, error: "Your session ended. Sign in again." };
  const { error } = await supabase.from("spaces").insert({
    org_id: orgId,
    name,
    key_prefix: prefix,
    description: input.description.trim() || null,
    created_by: userId,
  });
  if (error) {
    return {
      ok: false,
      error: error.code === "23505" ? `Another space already uses ${prefix}.` : SOMETHING_WRONG,
    };
  }
  refresh();
  return { ok: true, keyPrefix: prefix };
}

/** Rename a space or change its description (its creator and org admins). */
export async function updateSpace(
  spaceId: string,
  patch: { name?: string; description?: string },
): Promise<Result> {
  const row: { name?: string; description?: string | null } = {};
  if (patch.name !== undefined) {
    if (!patch.name.trim()) return { ok: false, error: "A space needs a name." };
    row.name = patch.name.trim();
  }
  if (patch.description !== undefined) row.description = patch.description.trim() || null;

  const { supabase } = await session();
  const { data, error } = await supabase.from("spaces").update(row).eq("id", spaceId).select("id");
  if (error || !data?.length) return { ok: false, error: "You can’t change this space." };
  refresh();
  return { ok: true };
}
