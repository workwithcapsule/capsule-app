import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { fingerprintOf, looksLikeInviteCode } from "@/lib/invite-links";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Where a one-click invite link lands. A valid link (single use, 7 days, invite
 * still open) signs the person straight in, creating their account the first
 * time, and sends them to the join flow. Anything else shows the sign-in page
 * with their email filled in.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url));

  const admin = createAdminClient();
  if (!admin || !looksLikeInviteCode(token)) return to("/login?error=invite");
  const fingerprint = fingerprintOf(token);

  const { data: email } = await admin.rpc("redeem_invitation_link", { p_token_hash: fingerprint });
  if (!email) {
    const { data: known } = await admin.rpc("invitation_link_email", { p_token_hash: fingerprint });
    const prefill = known ? `&email=${encodeURIComponent(known as string)}` : "";
    return to(`/login?error=invite${prefill}`);
  }

  // Make a one-time sign-in for that email (creating the account if it's new),
  // and use it right away on this request instead of emailing it.
  let link = await admin.auth.admin.generateLink({ type: "magiclink", email: email as string });
  if (link.error)
    link = await admin.auth.admin.generateLink({ type: "invite", email: email as string });
  const hashed = link.data?.properties?.hashed_token;
  // Supabase says which kind it made: "signup" for a new account, "magiclink"
  // for an existing one, or "invite".
  const kind = (link.data?.properties?.verification_type ?? "magiclink") as EmailOtpType;
  if (link.error || !hashed)
    return to(`/login?error=invite&email=${encodeURIComponent(email as string)}`);

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type: kind, token_hash: hashed });
  if (error) return to(`/login?error=invite&email=${encodeURIComponent(email as string)}`);

  return to("/join");
}
