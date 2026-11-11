"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendOpenInvitations, type SendSummary } from "@/lib/invitations";
import { isEmail } from "@/lib/validation";

/* Invitation actions for org admins. The database's access rules enforce who can do what. */

type Result = { ok: true; summary?: SendSummary } | { ok: false; error: string };
const SOMETHING_WRONG = "Something went wrong. Try again.";

export async function addInvitations(orgId: string, emails: string[]): Promise<Result> {
  const clean = [...new Set(emails.map((e) => e.trim().toLowerCase()))];
  if (!clean.length || clean.some((e) => !isEmail(e)))
    return { ok: false, error: "Check the email addresses." };
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const { error } = await supabase
    .from("invitations")
    .insert(clean.map((email) => ({ org_id: orgId, email, invited_by: claims?.claims?.sub })));
  if (error) {
    return {
      ok: false,
      error:
        error.code === "23505"
          ? "Someone on that list already has an invitation."
          : SOMETHING_WRONG,
    };
  }
  revalidatePath("/invite");
  return { ok: true };
}

export async function sendInvitations(orgId: string): Promise<Result> {
  const supabase = await createClient();
  const summary = await sendOpenInvitations(supabase, orgId);
  revalidatePath("/invite");
  return { ok: true, summary };
}

/** Emails one invitation again with a fresh link (the old link stops working). */
export async function resendInvitation(orgId: string, id: string): Promise<Result> {
  const supabase = await createClient();
  const summary = await sendOpenInvitations(supabase, orgId, { only: [id] });
  revalidatePath("/invite");
  return { ok: true, summary };
}

/** Unsent invitations are deleted; sent ones are withdrawn (kept for the record). */
export async function removeInvitation(id: string, sent: boolean): Promise<Result> {
  const supabase = await createClient();
  const { error } = sent
    ? await supabase
        .from("invitations")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id)
    : await supabase.from("invitations").delete().eq("id", id);
  if (error) return { ok: false, error: SOMETHING_WRONG };
  revalidatePath("/invite");
  return { ok: true };
}
