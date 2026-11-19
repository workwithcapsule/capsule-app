import "server-only";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Acting } from "@/lib/supabase/bearer";
import { supabaseEnv } from "@/lib/supabase/env";

/** Supabase Auth, which issues AI apps' tokens (its OAuth 2.1 server). */
export function authServerUrl() {
  return `${supabaseEnv().url.replace(/\/$/, "")}/auth/v1`;
}

function payloadOf(token: string): Record<string, unknown> | null {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

/**
 * Checks an AI app's token for the MCP route. The database checks the
 * token's signature and expiry, that it was issued to an AI app through
 * OAuth, that its session hasn't ended (Disconnect in Settings ends it) and
 * that the person still has the app connected (public.current_app_session).
 */
export async function verifyAppToken(
  _req: Request,
  token?: string,
): Promise<(AuthInfo & { extra: { acting: Acting } }) | undefined> {
  if (!token) return undefined;
  const claims = payloadOf(token);
  if (!claims || typeof claims.client_id !== "string") return undefined;
  const { url, key } = supabaseEnv();
  const supabase = createSupabaseClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await supabase.rpc("current_app_session").maybeSingle();
  const row = data as { user_id: string; client_id: string; app: string } | null;
  if (error || !row || row.user_id !== claims.sub || row.client_id !== claims.client_id)
    return undefined;

  return {
    token,
    clientId: row.client_id,
    scopes: String(claims.scope ?? "")
      .split(/\s+/)
      .filter(Boolean),
    expiresAt: typeof claims.exp === "number" ? claims.exp : undefined,
    extra: { acting: { token, userId: row.user_id, claims, app: row.app } },
  };
}
