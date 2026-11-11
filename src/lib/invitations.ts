import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { inviteEmail } from "@/lib/email/invite";
import { sendEmail } from "@/lib/email/send";
import { siteOrigin } from "@/lib/site";

export type SendSummary = {
  sent: string[];
  /** Saved but not emailed: test mode, or email not set up yet. */
  held: string[];
  failed: string[];
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Emails every open, unsent invitation in the org, as the signed-in admin.
 * Row-level security means only an org admin gets any rows back. Each sent
 * invitation is marked so it isn't emailed twice.
 */
export async function sendOpenInvitations(
  supabase: SupabaseClient,
  orgId: string,
): Promise<SendSummary> {
  const summary: SendSummary = { sent: [], held: [], failed: [] };

  const [{ data: invites }, { data: org }, { data: claims }] = await Promise.all([
    supabase
      .from("invitations")
      .select("id, email")
      .eq("org_id", orgId)
      .is("sent_at", null)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("created_at"),
    supabase.from("orgs").select("name").eq("id", orgId).single(),
    supabase.auth.getClaims(),
  ]);
  if (!invites?.length || !org) return summary;

  const { data: me } = await supabase
    .from("users")
    .select("name, email")
    .eq("id", claims?.claims?.sub as string)
    .single();
  const inviterName = me?.name?.trim() || me?.email || "A teammate";
  const origin = await siteOrigin();

  const sentIds: string[] = [];
  for (const [i, inv] of invites.entries()) {
    if (i > 0) await sleep(550); // Resend allows about 2 emails a second.
    const message = inviteEmail({
      inviterName,
      orgName: org.name,
      email: inv.email,
      joinUrl: `${origin}/login?email=${encodeURIComponent(inv.email)}`,
    });
    const result = await sendEmail({ to: inv.email, ...message });
    if (result.status === "sent") {
      sentIds.push(inv.id);
      summary.sent.push(inv.email);
    } else if (result.status === "skipped") {
      summary.held.push(inv.email);
    } else {
      summary.failed.push(inv.email);
    }
  }

  if (sentIds.length) await supabase.rpc("mark_invitations_sent", { p_ids: sentIds });
  return summary;
}
