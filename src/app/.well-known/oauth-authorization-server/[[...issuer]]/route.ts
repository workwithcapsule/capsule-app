import { metadataCorsOptionsRequestHandler } from "mcp-handler";
import { authServerUrl } from "@/lib/mcp/auth";

/**
 * Some older AI apps look for sign-in settings on the MCP server's own
 * address. Pass on Supabase Auth's (RFC 8414), unchanged.
 */
export async function GET() {
  const issuer = new URL(authServerUrl());
  const res = await fetch(
    `${issuer.origin}/.well-known/oauth-authorization-server${issuer.pathname}`,
    { cache: "no-store" },
  );
  return new Response(await res.text(), {
    status: res.status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
