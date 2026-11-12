"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Status } from "@/lib/design";

/*
 * Capsule, component and work item changes. Each runs as the signed-in
 * person, so the database's access rules (and per-column checks) decide what
 * is allowed; the page only offers what those rules permit.
 */

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
const NOT_ALLOWED = "You can’t change this.";
const SOMETHING_WRONG = "Something went wrong saving that. Try again.";

/** Turns database errors into plain messages. */
function explain(error: { code?: string; message: string }): string {
  if (error.code === "42501")
    return error.message.startsWith("new row") ? NOT_ALLOWED : error.message;
  if (error.code === "23505") return "That’s already there.";
  return SOMETHING_WRONG;
}

/** Re-renders pages with fresh data in the same round trip as the change. */
function refresh() {
  revalidatePath("/", "layout");
}

async function db() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return { supabase, userId: data?.claims?.sub as string | undefined };
}

// Capsule ---------------------------------------------------------------------

export type CapsulePatch = Partial<{
  name: string;
  outcome: string | null;
  status: Status;
  launch_date: string | null;
  date_type: "launch" | "due";
  owner_id: string | null;
}>;

export async function updateCapsule(id: string, patch: CapsulePatch): Promise<Result> {
  if (patch.name !== undefined && !patch.name.trim())
    return { ok: false, error: "A capsule needs a name." };
  const { supabase } = await db();
  const { data, error } = await supabase.from("capsules").update(patch).eq("id", id).select("id");
  if (error) return { ok: false, error: explain(error) };
  if (data?.length) refresh();
  return data?.length ? { ok: true } : { ok: false, error: NOT_ALLOWED };
}

export async function createCapsule(input: unknown): Promise<Result<{ id: string; key: string }>> {
  const { supabase } = await db();
  const { data, error } = await supabase.rpc("create_capsule", { p_input: input });
  if (error)
    return {
      ok: false,
      error: error.code === "23505" ? "Each component can only be added once." : explain(error),
    };
  refresh();
  return { ok: true, data: data as { id: string; key: string } };
}

// Components ------------------------------------------------------------------

export type ComponentPatch = Partial<{
  owner_id: string | null;
  due_date: string | null;
  status: Status;
  goal: string | null;
}>;

export async function updateComponent(id: string, patch: ComponentPatch): Promise<Result> {
  const { supabase } = await db();
  const { data, error } = await supabase.from("components").update(patch).eq("id", id).select("id");
  if (error) return { ok: false, error: explain(error) };
  if (data?.length) refresh();
  return data?.length ? { ok: true } : { ok: false, error: NOT_ALLOWED };
}

export async function addCollaborator(input: {
  orgId: string;
  capsuleId: string;
  componentId: string;
  userId: string;
}): Promise<Result> {
  const { supabase } = await db();
  const { error } = await supabase.from("component_people").insert({
    org_id: input.orgId,
    capsule_id: input.capsuleId,
    component_id: input.componentId,
    user_id: input.userId,
  });
  if (error)
    return { ok: false, error: error.code === "23505" ? "They’re already on it." : explain(error) };
  refresh();
  return { ok: true };
}

export async function removeCollaborator(componentId: string, userId: string): Promise<Result> {
  const { supabase } = await db();
  const { data, error } = await supabase
    .from("component_people")
    .delete()
    .eq("component_id", componentId)
    .eq("user_id", userId)
    .select("user_id");
  if (error) return { ok: false, error: explain(error) };
  if (data?.length) refresh();
  return data?.length ? { ok: true } : { ok: false, error: NOT_ALLOWED };
}

// Work items ------------------------------------------------------------------

export async function addWorkItem(input: {
  orgId: string;
  capsuleId: string;
  componentId: string;
  title: string;
  assigneeId?: string | null;
  done?: boolean;
  position?: number;
}): Promise<Result<{ id: string }>> {
  if (!input.title.trim()) return { ok: false, error: "Give the work item a title." };
  const { supabase, userId } = await db();
  const { data, error } = await supabase
    .from("work_items")
    .insert({
      org_id: input.orgId,
      capsule_id: input.capsuleId,
      component_id: input.componentId,
      title: input.title.trim(),
      assignee_id: input.assigneeId ?? null,
      done: input.done ?? false,
      position: input.position ?? 0,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: explain(error) };
  refresh();
  return { ok: true, data: { id: data.id } };
}

export async function updateWorkItem(
  id: string,
  patch: Partial<{ title: string; done: boolean; assignee_id: string | null }>,
): Promise<Result> {
  if (patch.title !== undefined && !patch.title.trim())
    return { ok: false, error: "A work item needs a title." };
  const { supabase } = await db();
  const { data, error } = await supabase.from("work_items").update(patch).eq("id", id).select("id");
  if (error) return { ok: false, error: explain(error) };
  if (data?.length) refresh();
  return data?.length ? { ok: true } : { ok: false, error: NOT_ALLOWED };
}

export async function deleteWorkItem(id: string): Promise<Result> {
  const { supabase } = await db();
  const { data, error } = await supabase.from("work_items").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: explain(error) };
  if (data?.length) refresh();
  return data?.length ? { ok: true } : { ok: false, error: NOT_ALLOWED };
}

// Adding and removing components (capsule owner) --------------------------------

export async function addComponent(input: {
  orgId: string;
  capsuleId: string;
  componentTypeId: string;
  position: number;
}): Promise<Result<{ id: string }>> {
  const { supabase } = await db();
  const { data, error } = await supabase
    .from("components")
    .insert({
      org_id: input.orgId,
      capsule_id: input.capsuleId,
      component_type_id: input.componentTypeId,
      position: input.position,
    })
    .select("id")
    .single();
  if (error)
    return {
      ok: false,
      error: error.code === "23505" ? "That component is already in this capsule." : explain(error),
    };
  refresh();
  return { ok: true, data: { id: data.id } };
}

/** Removes a component; its work items move to `moveTo` or are removed too. Returns what Undo needs. */
export async function removeComponent(id: string, moveTo: string | null): Promise<Result<unknown>> {
  const { supabase } = await db();
  const { data, error } = await supabase.rpc("remove_component", {
    p_component: id,
    p_move_to: moveTo,
  });
  if (error) return { ok: false, error: explain(error) };
  refresh();
  return { ok: true, data };
}

export async function restoreComponent(snapshot: unknown): Promise<Result> {
  const { supabase } = await db();
  const { error } = await supabase.rpc("restore_component", { p_snapshot: snapshot });
  if (error) return { ok: false, error: explain(error) };
  refresh();
  return { ok: true };
}
