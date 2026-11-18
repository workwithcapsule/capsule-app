import { metadataCorsOptionsRequestHandler, protectedResourceHandler } from "mcp-handler";
import { authServerUrl } from "@/lib/mcp/auth";

/**
 * Tells AI apps where to sign in for Capsule's MCP server (RFC 9728): Supabase
 * Auth. Served at /.well-known/oauth-protected-resource/mcp and, for apps that
 * look there first, at /.well-known/oauth-protected-resource.
 */
export function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const forwarded = req.headers.get("x-forwarded-host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const base = forwarded ? `${proto}://${forwarded}` : origin;
  return protectedResourceHandler({ authServerUrls: [authServerUrl()], resourceUrl: `${base}/mcp` })(
    req,
  );
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
