"use server";

import { createClient } from "@/lib/supabase/server";
import { COMPONENT_COLORS } from "@/lib/design";
import { isEmail, prefixError } from "@/lib/validation";
import { ICON_KEYS } from "@/components/component-icon";
import { loadOnboarding } from "./data";
import type { ActionResult, OnboardingComponent, OnboardingSpace } from "./types";

/*
 * Every action runs as the signed-in person, so the database's access rules
 * decide what is allowed (only org admins can change these things).
 */

const fail = (error: string): ActionResult => ({ ok: false, error });
const SOMETHING_WRONG = "Something went wrong saving this. Try again.";

async function me() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return { supabase, userId: data?.claims?.sub as string | undefined };
}

/** Step 1: create the org (or update names if it already exists). */
export async function saveAccount(input: {
  orgId: string | null;
  yourName: string;
  orgName: string;
}): Promise<ActionResult & { orgId?: string; components?: OnboardingComponent[] }> {
  const yourName = input.yourName.trim();
  const orgName = input.orgName.trim();
  if (!yourName || !orgName) return fail("Enter your name and your organization’s name.");
  const { supabase, userId } = await me();
  if (!userId) return fail("Your session ended. Sign in again.");

  if (!input.orgId) {
    const { data, error } = await supabase.rpc("create_org", {
      p_org_name: orgName,
      p_your_name: yourName,
    });
    if (error) return fail(error.code === "42501" ? error.message : SOMETHING_WRONG);
    const { components } = await loadOnboarding();
    return { ok: true, orgId: data as string, components };
  }

  const [a, b] = await Promise.all([
    supabase.from("users").update({ name: yourName }).eq("id", userId),
    supabase.from("orgs").update({ name: orgName, onboarding_step: 2 }).eq("id", input.orgId),
  ]);
  if (a.error || b.error) return fail(SOMETHING_WRONG);
  return { ok: true, orgId: input.orgId };
}

/** Remembers which step the admin reached, so a refresh resumes there. */
export async function saveStep(orgId: string, step: number): Promise<ActionResult> {
  const { supabase } = await me();
  const { error } = await supabase
    .from("orgs")
    .update({ onboarding_step: Math.min(5, Math.max(2, step)) })
    .eq("id", orgId);
  return error ? fail(SOMETHING_WRONG) : { ok: true };
}

/** Step 2: save the org's components (rename, recolor, add, remove). */
export async function saveComponents(
  orgId: string,
  components: OnboardingComponent[],
): Promise<ActionResult> {
  const names = components.map((c) => c.name.trim().toLowerCase());
  if (components.length === 0) return fail("Keep at least one component.");
  if (names.some((n) => !n)) return fail("Give every component a name.");
  if (new Set(names).size !== names.length) return fail("Two components can’t have the same name.");
  if (components.some((c) => !COMPONENT_COLORS.includes(c.color) || !ICON_KEYS.includes(c.icon))) {
    return fail(SOMETHING_WRONG);
  }

  const { supabase } = await me();
  const { data: existing, error: readError } = await supabase
    .from("component_types")
    .select("id")
    .eq("org_id", orgId);
  if (readError) return fail(SOMETHING_WRONG);

  const keep = new Set(components.filter((c) => c.id).map((c) => c.id));
  const removed = (existing ?? []).map((r) => r.id).filter((id) => !keep.has(id));
  if (removed.length) {
    const { error } = await supabase.from("component_types").delete().in("id", removed);
    if (error) return fail(SOMETHING_WRONG);
  }

  // Temporarily rename saved rows so swapping two names doesn't collide.
  const saved = components.filter((c) => c.id);
  for (const c of saved) {
    const { error } = await supabase
      .from("component_types")
      .update({ name: `~${c.id}` })
      .eq("id", c.id!);
    if (error) return fail(SOMETHING_WRONG);
  }

  for (const [position, c] of components.entries()) {
    const row = {
      name: c.name.trim(),
      description: c.description.trim() || null,
      color: c.color,
      icon: c.icon,
      position,
    };
    const { error } = c.id
      ? await supabase.from("component_types").update(row).eq("id", c.id)
      : await supabase.from("component_types").insert({ ...row, org_id: orgId });
    if (error) return fail(SOMETHING_WRONG);
  }

  return saveStep(orgId, 3);
}

/** Step 3: add the new spaces. Saved spaces keep their key prefix. */
export async function saveSpaces(orgId: string, spaces: OnboardingSpace[]): Promise<ActionResult> {
  const { supabase, userId } = await me();
  const fresh = spaces.filter((s) => !s.id);
  const prefixes = spaces.map((s) => s.prefix.trim().toUpperCase());
  for (const [i, s] of spaces.entries()) {
    if (!s.name.trim()) return fail("Give every space a name.");
    const err = prefixError(
      s.prefix,
      prefixes.filter((_, j) => j !== i),
    );
    if (err) return fail(`${s.name}: ${err}`);
  }

  for (const s of fresh) {
    const { error } = await supabase.from("spaces").insert({
      org_id: orgId,
      name: s.name.trim(),
      key_prefix: s.prefix.trim().toUpperCase(),
      created_by: userId,
    });
    if (error) {
      return fail(
        error.code === "23505"
          ? `Another space already uses ${s.prefix.toUpperCase()}.`
          : SOMETHING_WRONG,
      );
    }
  }
  return saveStep(orgId, 4);
}

/** Step 5: save the invite list and finish onboarding. */
export async function finishOnboarding(orgId: string, invites: string[]): Promise<ActionResult> {
  const emails = [...new Set(invites.map((e) => e.trim().toLowerCase()))];
  if (emails.some((e) => !isEmail(e))) return fail("Check the email addresses and try again.");

  const { supabase, userId } = await me();
  const { data: open, error: readError } = await supabase
    .from("invitations")
    .select("id, email, sent_at")
    .eq("org_id", orgId)
    .is("accepted_at", null)
    .is("revoked_at", null);
  if (readError) return fail(SOMETHING_WRONG);

  const already = new Set((open ?? []).map((i) => i.email));
  const toRemove = (open ?? [])
    .filter((i) => !emails.includes(i.email) && !i.sent_at)
    .map((i) => i.id);
  if (toRemove.length) {
    const { error } = await supabase.from("invitations").delete().in("id", toRemove);
    if (error) return fail(SOMETHING_WRONG);
  }
  const toAdd = emails.filter((e) => !already.has(e));
  if (toAdd.length) {
    const { error } = await supabase
      .from("invitations")
      .insert(toAdd.map((email) => ({ org_id: orgId, email, invited_by: userId })));
    if (error) return fail(SOMETHING_WRONG);
  }

  const { error } = await supabase
    .from("orgs")
    .update({ onboarded_at: new Date().toISOString(), onboarding_step: 5 })
    .eq("id", orgId);
  return error ? fail(SOMETHING_WRONG) : { ok: true };
}
