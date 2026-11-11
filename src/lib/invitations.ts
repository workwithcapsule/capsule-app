import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { inviteEmail } from "@/lib/email/invite";
import { sendEmail } from "@/lib/email/send";
import { fingerprintOf, newInviteCode } from "@/lib/invite-links";
import { siteOrigin } from "@/lib/site";

export type SendSummary = {
  sent: string[];
  /** Saved but not emailed: test mode, or email not set up yet. */
  held: string[];
  failed: string[];
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One-click links need the server's secret key to sign people in. */
const oneClickLinks = () => Boolean(process.env.SUPABASE_SECRET_KEY);

/**
 * Emails open invitations in the org, as the signed-in admin: every unsent
 * one, or only those listed in `only` (which may already have been sent). Row-level security means only an org
 * admin gets rows back. Each email carries a new single-use link (valid 7
 * days) that replaces any earlier one for that invitation.
 */
export async function sendOpenInvitations(
  supabase: SupabaseClient,
  orgId: string,
  options: { only?: string[] } = {},
): Promise<SendSummary> {
  const summary: SendSummary = { sent: [], held: [], failed: [] };

  const [{ data: open }, { data: org }, { data: claims }] = await Promise.all([
    supabase
      .from("invitations")
      .select("id, email, sent_at")
      .eq("org_id", orgId)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("created_at"),
    supabase.from("orgs").select("name").eq("id", orgId).single(),
    supabase.auth.getClaims(),
  ]);
  const invites = (open ?? []).filter((i) =>
    options.only ? options.only.includes(i.id) : !i.sent_at,
  );
  if (!invites.length || !org) return summary;

  const { data: me } = await supabase
    .from("users")
    .select("name, email")
    .eq("id", claims?.claims?.sub as string)
    .single();
  const inviterName = me?.name?.trim() || me?.email || "A teammate";
  const origin = await siteOrigin();

  for (const [i, inv] of invites.entries()) {
    if (i > 0) await sleep(550); // Resend allows about 2 emails a second.
    const code = oneClickLinks() ? newInviteCode() : null;
    const message = inviteEmail({
      inviterName,
      orgName: org.name,
      email: inv.email,
      joinUrl: code
        ? `${origin}/auth/invite/${code}`
        : `${origin}/login?email=${encodeURIComponent(inv.email)}`,
      oneClick: Boolean(code),
    });
    const result = await sendEmail({ to: inv.email, ...message });
    if (result.status === "sent") {
      await supabase.rpc("record_invitation_sent", {
        p_id: inv.id,
        p_token_hash: code ? fingerprintOf(code) : null,
      });
      summary.sent.push(inv.email);
    } else if (result.status === "skipped") {
      summary.held.push(inv.email);
    } else {
      summary.failed.push(inv.email);
    }
  }
  return summary;
}
