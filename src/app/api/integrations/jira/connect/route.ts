import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { authorizeUrl, jiraConfigured } from "@/lib/jira/client";
import { safeNext } from "@/lib/routing";
import { createClient } from "@/lib/supabase/server";

/*
 * Starts connecting someone's own Jira account (step 14): sends them to
 * Atlassian to approve Capsule, remembering where to bring them back.
 */

import { JIRA_STATE_COOKIE as STATE_COOKIE } from "@/lib/jira/state";

export async function GET(request: NextRequest) {
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  const back = (q: string) =>
    NextResponse.redirect(
      new URL(`${next}${next.includes("?") ? "&" : "?"}jira=${q}`, request.url),
    );
  if (!jiraConfigured()) return back("not_configured");
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return NextResponse.redirect(new URL("/login", request.url));

  const state = randomBytes(24).toString("base64url");
  const redirectUri = new URL("/api/integrations/jira/callback", request.url).toString();
  const res = NextResponse.redirect(authorizeUrl(state, redirectUri));
  res.cookies.set(STATE_COOKIE, JSON.stringify({ state, next }), {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/api/integrations/jira",
    maxAge: 600,
  });
  return res;
}
