"use server";

import { revalidatePath } from "next/cache";
import { notifyLater } from "@/lib/notify";
import { createClient } from "@/lib/supabase/server";
import type { Status } from "@/lib/design";
import type { ItemStatus } from "@/lib/work-items";

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
  if (error.code === "22023") return error.message;
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
  const { supabase, userId } = await db();
  const { data, error } = await supabase.from("capsules").update(patch).eq("id", id).select("id");
  if (error) return { ok: false, error: explain(error) };
  if (!data?.length) return { ok: false, error: NOT_ALLOWED };
  refresh();
  if (patch.owner_id)
    await notifyLater(userId, { kind: "capsule_owner", capsuleId: id, ownerId: patch.owner_id });
  return { ok: true };
}

export async function createCapsule(input: unknown): Promise<Result<{ id: string; key: string }>> {
  const { supabase, userId } = await db();
  const { data, error } = await supabase.rpc("create_capsule", { p_input: input });
  if (error)
    return {
      ok: false,
      error: error.code === "23505" ? "Each component can only be added once." : explain(error),
    };
  refresh();
  const made = data as { id: string; key: string };
  // "Component owners will be notified when you click create."
  await notifyLater(userId, { kind: "new_capsule", capsuleId: made.id });
  return { ok: true, data: made };
}

// Components ------------------------------------------------------------------

export type ComponentPatch = Partial<{
  owner_id: string | null;
  due_date: string | null;
  status: Status;
  goal: string | null;
}>;

export async function updateComponent(id: string, patch: ComponentPatch): Promise<Result> {
  const { supabase, userId } = await db();
  const { data, error } = await supabase.from("components").update(patch).eq("id", id).select("id");
  if (error) return { ok: false, error: explain(error) };
  if (!data?.length) return { ok: false, error: NOT_ALLOWED };
  refresh();
  if (patch.owner_id)
    await notifyLater(userId, {
      kind: "component_owner",
      componentId: id,
      ownerId: patch.owner_id,
    });
  return { ok: true };
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
  /** Set when Undo puts back a deleted item, so it keeps its id. */
  id?: string;
  orgId: string;
  capsuleId: string;
  componentId: string;
  title: string;
  assigneeId?: string | null;
  done?: boolean;
  position?: number;
  /** For Undo: the item's status, notes and pieces as they were. */
  status?: ItemStatus;
  statusManual?: boolean;
  note?: string | null;
  pieces?: PieceInput[];
}): Promise<Result<{ id: string }>> {
  if (!input.title.trim()) return { ok: false, error: "Give the work item a title." };
  const { supabase, userId } = await db();
  const { data, error } = await supabase
    .from("work_items")
    .insert({
      ...(input.id && { id: input.id }),
      org_id: input.orgId,
      capsule_id: input.capsuleId,
      component_id: input.componentId,
      title: input.title.trim(),
      assignee_id: input.assigneeId ?? null,
      done: input.done ?? false,
      position: input.position ?? 0,
      created_by: userId,
      ...(input.status && { status: input.status }),
      ...(input.note && { note: input.note }),
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: explain(error) };
  if (input.pieces?.length) {
    const { error: e2 } = await supabase.from("work_item_collaborators").insert(
      input.pieces.map((p) => ({
        id: p.id,
        org_id: input.orgId,
        capsule_id: input.capsuleId,
        work_item_id: data.id,
        user_id: p.userId,
        piece: p.piece,
        status: p.status,
        is_lead: p.isLead,
        created_by: userId,
      })),
    );
    if (e2) return { ok: false, error: explain(e2) };
    if (input.statusManual)
      await supabase
        .from("work_items")
        .update({ status: input.status, status_manual: true })
        .eq("id", data.id);
  }
  refresh();
  // Undo putting back a deleted item (input.id) isn't a new assignment.
  if (input.assigneeId && !input.id && !input.done)
    await notifyLater(userId, { kind: "assigned", itemId: data.id, assigneeId: input.assigneeId });
  return { ok: true, data: { id: data.id } };
}

export async function updateWorkItem(
  id: string,
  patch: Partial<{
    title: string;
    done: boolean;
    assignee_id: string | null;
    status: ItemStatus;
    status_manual: boolean;
    note: string | null;
  }>,
): Promise<Result> {
  if (patch.title !== undefined && !patch.title.trim())
    return { ok: false, error: "A work item needs a title." };
  if (patch.note !== undefined && patch.note !== null && patch.note.length > 5000)
    return { ok: false, error: "Keep notes under 5,000 characters." };
  const { supabase, userId } = await db();
  const { data, error } = await supabase.from("work_items").update(patch).eq("id", id).select("id");
  if (error) return { ok: false, error: explain(error) };
  if (!data?.length) return { ok: false, error: NOT_ALLOWED };
  refresh();
  if (patch.assignee_id)
    await notifyLater(userId, { kind: "assigned", itemId: id, assigneeId: patch.assignee_id });
  return { ok: true };
}

export async function deleteWorkItem(id: string): Promise<Result> {
  const { supabase } = await db();
  const { data, error } = await supabase.from("work_items").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: explain(error) };
  if (data?.length) refresh();
  return data?.length ? { ok: true } : { ok: false, error: NOT_ALLOWED };
}

// Collaborators on a work item (step 12) ----------------------------------------

export type PieceInput = {
  /** Set when Undo puts a removed collaborator back, so it keeps its id. */
  id?: string;
  userId: string;
  piece: string;
  status: ItemStatus;
  isLead: boolean;
};

export async function addPiece(input: {
  orgId: string;
  capsuleId: string;
  itemId: string;
  piece: PieceInput;
}): Promise<Result<{ id: string }>> {
  if (input.piece.piece.length > 80) return { ok: false, error: "Keep it under 80 characters." };
  const { supabase, userId } = await db();
  const { data, error } = await supabase
    .from("work_item_collaborators")
    .insert({
      ...(input.piece.id && { id: input.piece.id }),
      org_id: input.orgId,
      capsule_id: input.capsuleId,
      work_item_id: input.itemId,
      user_id: input.piece.userId,
      piece: input.piece.piece.trim(),
      status: input.piece.status,
      is_lead: input.piece.isLead,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: explain(error) };
  refresh();
  if (!input.piece.id)
    await notifyLater(userId, { kind: "piece", pieceId: data.id, userId: input.piece.userId });
  return { ok: true, data: { id: data.id } };
}

export async function updatePiece(
  id: string,
  patch: Partial<{ piece: string; status: ItemStatus; is_lead: boolean }>,
): Promise<Result> {
  if (patch.piece !== undefined) {
    patch = { ...patch, piece: patch.piece.trim() };
    if (patch.piece!.length > 80) return { ok: false, error: "Keep it under 80 characters." };
  }
  const { supabase } = await db();
  const { data, error } = await supabase
    .from("work_item_collaborators")
    .update(patch)
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: explain(error) };
  if (!data?.length) return { ok: false, error: NOT_ALLOWED };
  refresh();
  return { ok: true };
}

export async function removePiece(id: string): Promise<Result> {
  const { supabase } = await db();
  const { data, error } = await supabase
    .from("work_item_collaborators")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: explain(error) };
  if (!data?.length) return { ok: false, error: NOT_ALLOWED };
  refresh();
  return { ok: true };
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

// Comments ----------------------------------------------------------------------

export async function postComment(input: {
  capsuleId: string;
  body: string;
  mentions: string[];
}): Promise<Result<{ id: string }>> {
  const body = input.body.trim();
  if (!body) return { ok: false, error: "Write a comment first." };
  if (body.length > 2000) return { ok: false, error: "Comments can be up to 2,000 characters." };
  const { supabase, userId } = await db();
  const { data, error } = await supabase.rpc("post_comment", {
    p_capsule: input.capsuleId,
    p_body: body,
    p_mentions: input.mentions,
  });
  if (error) return { ok: false, error: explain(error) };
  refresh();
  if (input.mentions.length)
    await notifyLater(userId, { kind: "mention", commentId: data as string });
  return { ok: true, data: { id: data as string } };
}

/** Deleting your own comment adds an entry that hides it; Undo adds one that shows it again. */
async function markComment(
  kind: "comment_deleted" | "comment_restored",
  input: { orgId: string; capsuleId: string; commentId: string },
): Promise<Result> {
  const { supabase, userId } = await db();
  const { error } = await supabase.from("events").insert({
    org_id: input.orgId,
    capsule_id: input.capsuleId,
    actor_user_id: userId,
    kind,
    data: { comment_id: input.commentId },
  });
  if (error) return { ok: false, error: explain(error) };
  refresh();
  return { ok: true };
}

export async function deleteComment(input: {
  orgId: string;
  capsuleId: string;
  commentId: string;
}): Promise<Result> {
  return markComment("comment_deleted", input);
}

export async function restoreComment(input: {
  orgId: string;
  capsuleId: string;
  commentId: string;
}): Promise<Result> {
  return markComment("comment_restored", input);
}

// Following ---------------------------------------------------------------------

/** `since` is only set by Undo after unfollowing, so the original date is kept. */
export async function followCapsule(input: {
  orgId: string;
  capsuleId: string;
  since?: string;
}): Promise<Result> {
  const { supabase, userId } = await db();
  const { error } = await supabase.from("followers").insert({
    org_id: input.orgId,
    capsule_id: input.capsuleId,
    user_id: userId,
    ...(input.since && { created_at: input.since }),
  });
  if (error && error.code !== "23505") return { ok: false, error: explain(error) };
  refresh();
  return { ok: true };
}

export async function unfollowCapsule(capsuleId: string): Promise<Result> {
  const { supabase, userId } = await db();
  const { error } = await supabase
    .from("followers")
    .delete()
    .eq("capsule_id", capsuleId)
    .eq("user_id", userId!);
  if (error) return { ok: false, error: explain(error) };
  refresh();
  return { ok: true };
}

// Attachments (step 10) -------------------------------------------------------

type NewAttachment = { orgId: string; capsuleId: string; name: string } & (
  | { kind: "link"; url: string; linkType: string }
  | { kind: "file"; storagePath: string; sizeBytes: number; mimeType: string | null }
);

export async function addAttachment(input: NewAttachment): Promise<Result<{ id: string }>> {
  const name = input.name.trim().slice(0, 300);
  if (!name) return { ok: false, error: "Give it a name." };
  if (input.kind === "link" && !/^https?:\/\//i.test(input.url))
    return { ok: false, error: "That doesn’t look like a link." };
  const { supabase, userId } = await db();
  const { data, error } = await supabase
    .from("attachments")
    .insert({
      org_id: input.orgId,
      capsule_id: input.capsuleId,
      kind: input.kind,
      name,
      added_by: userId,
      ...(input.kind === "link"
        ? { url: input.url, link_type: input.linkType }
        : {
            storage_path: input.storagePath,
            size_bytes: input.sizeBytes,
            mime_type: input.mimeType,
          }),
    })
    .select("id")
    .single();
  if (error)
    return {
      ok: false,
      error: error.code === "23505" ? "That link is already attached." : explain(error),
    };
  refresh();
  return { ok: true, data: { id: data.id } };
}

/** Removing is a soft delete, so Undo (restoreAttachment) can bring it back. */
export async function removeAttachment(id: string): Promise<Result> {
  const { supabase } = await db();
  const { data, error } = await supabase
    .from("attachments")
    .update({ removed_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: explain(error) };
  if (data?.length) refresh();
  return data?.length ? { ok: true } : { ok: false, error: NOT_ALLOWED };
}

export async function restoreAttachment(id: string): Promise<Result> {
  const { supabase } = await db();
  const { data, error } = await supabase
    .from("attachments")
    .update({ removed_at: null })
    .eq("id", id)
    .select("id");
  if (error)
    return {
      ok: false,
      error: error.code === "23505" ? "That link was attached again meanwhile." : explain(error),
    };
  if (data?.length) refresh();
  return data?.length ? { ok: true } : { ok: false, error: NOT_ALLOWED };
}

/** A private link to an attached file, valid for 5 minutes. */
export async function fileLink(storagePath: string): Promise<Result<{ url: string }>> {
  const { supabase } = await db();
  const { data, error } = await supabase.storage
    .from("attachments")
    .createSignedUrl(storagePath, 300);
  if (error || !data) return { ok: false, error: "Couldn’t open that file. Try again." };
  return { ok: true, data: { url: data.signedUrl } };
}
