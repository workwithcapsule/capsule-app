import { NextResponse, type NextRequest } from "next/server";
import {
  connectionOf,
  exchangeCode,
  jiraAccount,
  saveConnection,
  sitesFor,
} from "@/lib/jira/client";
import { safeNext } from "@/lib/routing";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { JIRA_STATE_COOKIE as STATE_COOKIE } from "@/lib/jira/state";

/*
 * Atlassian sends people back here after they approve (or cancel) Capsule.
 * Saves their Jira connection, with the tokens encrypted, and returns them to
 * where they started with ?jira=connected (or a reason it didn't work).
 */

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  let saved: { state?: string; next?: string } = {};
  try {
    saved = JSON.parse(request.cookies.get(STATE_COOKIE)?.value ?? "{}");
  } catch {}
  const next = safeNext(saved.next);
  const back = (q: string) => {
    const res = NextResponse.redirect(
      new URL(`${next}${next.includes("?") ? "&" : "?"}jira=${q}`, request.url),
    );
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/integrations/jira" });
    return res;
  };

  const code = params.get("code");
  if (!code) return back("cancelled");
  if (!saved.state || params.get("state") !== saved.state) return back("expired");

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) return back("expired");
  const { data: membership } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  const admin = createAdminClient();
  if (!membership || !admin) return back("error");

  const redirectUri = new URL("/api/integrations/jira/callback", request.url).toString();
  const tokens = await exchangeCode(code, redirectUri);
  if (!tokens) return back("error");
  const [site] = await sitesFor(tokens.access_token);
  if (!site) return back("no_site");

  const ok = await saveConnection(admin, { orgId: membership.org_id, userId, tokens, site });
  if (!ok) return back("error");
  // Their name on the Jira site, for Settings.
  const conn = await connectionOf(admin, userId);
  if (conn) {
    const account = await jiraAccount(admin, conn);
    if (account.accountName)
      await admin
        .from("integrations")
        .update({ account_id: account.accountId, account_name: account.accountName })
        .eq("id", conn.id);
  }
  return back("connected");
}
