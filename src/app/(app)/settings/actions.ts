"use server";

import { revalidatePath } from "next/cache";
import { ICON_KEYS } from "@/components/component-icon";
import { COMPONENT_COLORS } from "@/lib/design";
import { createClient } from "@/lib/supabase/server";
import type { SettingsComponent } from "./types";

type Result = { ok: true } | { ok: false; error: string };
const SOMETHING_WRONG = "Something went wrong saving that. Try again.";

async function me() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return { supabase, userId: data?.claims?.sub as string | undefined };
}

export async function saveName(name: string): Promise<Result> {
  const n = name.trim();
  if (!n) return { ok: false, error: "Add your name." };
  if (n.length > 120) return { ok: false, error: "Names can be up to 120 characters." };
  const { supabase, userId } = await me();
  const { error } = await supabase.from("users").update({ name: n }).eq("id", userId!);
  if (error) return { ok: false, error: SOMETHING_WRONG };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** The one notification switch (build-decisions.md 48). */
export async function setEmailNotifications(on: boolean): Promise<Result> {
  const { supabase, userId } = await me();
  const { error } = await supabase
    .from("users")
    .update({ email_notifications: on })
    .eq("id", userId!);
  if (error) return { ok: false, error: SOMETHING_WRONG };
  return { ok: true };
}

/**
 * Org components (org admins only; the database checks). Removing a
 * component only stops it being offered for new capsules: existing capsules
 * keep it. Adding back a removed name brings that component back.
 */
/** Saved, with each component's id by its key (new ones get theirs here). */
type SaveComponentsResult =
  { ok: true; ids: Record<string, string> } | { ok: false; error: string };

export async function saveOrgComponents(
  orgId: string,
  components: SettingsComponent[],
): Promise<SaveComponentsResult> {
  const names = components.map((c) => c.name.trim().toLowerCase());
  if (components.length === 0) return { ok: false, error: "Keep at least one component." };
  if (names.some((n) => !n)) return { ok: false, error: "Give every component a name." };
  if (new Set(names).size !== names.length)
    return { ok: false, error: "Two components can’t have the same name." };
  if (components.some((c) => !COMPONENT_COLORS.includes(c.color) || !ICON_KEYS.includes(c.icon)))
    return { ok: false, error: SOMETHING_WRONG };

  const { supabase } = await me();
  const { data: existing, error: readError } = await supabase
    .from("component_types")
    .select("id, name, archived_at")
    .eq("org_id", orgId);
  if (readError) return { ok: false, error: SOMETHING_WRONG };
  const rows = existing ?? [];

  // A new component with a removed component's name brings that one back.
  const archivedByName = new Map(
    rows.filter((r) => r.archived_at).map((r) => [r.name.trim().toLowerCase(), r.id]),
  );
  const list = components.map((c) =>
    !c.id && archivedByName.has(c.name.trim().toLowerCase())
      ? { ...c, id: archivedByName.get(c.name.trim().toLowerCase()) }
      : c,
  );
  const kept = new Set(list.filter((c) => c.id).map((c) => c.id));
  for (const c of list) {
    const clash = rows.find(
      (r) =>
        r.archived_at &&
        r.id !== c.id &&
        r.name.trim().toLowerCase() === c.name.trim().toLowerCase(),
    );
    if (clash)
      return { ok: false, error: `A removed component is already called “${c.name.trim()}”.` };
  }

  // Remove (archive) the ones taken off the list.
  const removed = rows.filter((r) => !r.archived_at && !kept.has(r.id)).map((r) => r.id);
  if (removed.length) {
    const { error } = await supabase
      .from("component_types")
      .update({ archived_at: new Date().toISOString() })
      .in("id", removed);
    if (error) return { ok: false, error: "Only org admins can change org components." };
  }

  // Temporarily rename saved rows so swapping two names doesn't collide.
  for (const c of list.filter((x) => x.id)) {
    const { error } = await supabase
      .from("component_types")
      .update({ name: `~${c.id}` })
      .eq("id", c.id!);
    if (error) return { ok: false, error: "Only org admins can change org components." };
  }
  const ids: Record<string, string> = {};
  for (const [position, c] of list.entries()) {
    const row = {
      name: c.name.trim(),
      description: c.description.trim() || null,
      color: c.color,
      icon: c.icon,
      position,
      archived_at: null,
    };
    if (c.id) {
      const { error } = await supabase.from("component_types").update(row).eq("id", c.id);
      if (error) return { ok: false, error: SOMETHING_WRONG };
      ids[c.key] = c.id;
    } else {
      const { data, error } = await supabase
        .from("component_types")
        .insert({ ...row, org_id: orgId })
        .select("id")
        .single();
      if (error || !data) return { ok: false, error: SOMETHING_WRONG };
      ids[c.key] = data.id;
    }
  }
  revalidatePath("/", "layout");
  return { ok: true, ids };
}

/**
 * Disconnects an AI app (step 13): Supabase Auth revokes the person's
 * approval and the app's tokens stop working on the next request.
 */
export async function disconnectApp(clientId: string): Promise<Result> {
  const { supabase, userId } = await me();
  if (!userId) return { ok: false, error: SOMETHING_WRONG };
  const { error } = await supabase.auth.oauth.revokeGrant({ clientId });
  if (error) return { ok: false, error: "Couldn’t disconnect it. Try again." };
  revalidatePath("/settings");
  return { ok: true };
}

/** Disconnects the person's own Jira account (step 14). Linked items keep their last details. */
export async function disconnectJira(): Promise<Result> {
  const { supabase, userId } = await me();
  if (!userId) return { ok: false, error: SOMETHING_WRONG };
  const { error } = await supabase
    .from("integrations")
    .delete()
    .eq("user_id", userId)
    .eq("tool", "jira");
  if (error) return { ok: false, error: "Couldn’t disconnect Jira. Try again." };
  revalidatePath("/", "layout");
  return { ok: true };
}
