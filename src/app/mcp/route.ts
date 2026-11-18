import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { verifyAppToken } from "@/lib/mcp/auth";
import { registerTools } from "@/lib/mcp/tools";
import { actingAs, type Acting } from "@/lib/supabase/bearer";

/*
 * Capsule's MCP server (step 13): Claude, ChatGPT and other MCP apps use
 * Capsule here, as the person who connected them. Apps sign in through
 * Supabase's OAuth 2.1 server (discovered from
 * /.well-known/oauth-protected-resource/mcp) and the person approves them
 * on /oauth/consent.
 */

const mcp = createMcpHandler(registerTools, {
  serverInfo: { name: "Capsule", version: "1.0.0" },
  instructions:
    "Capsule follows one outcome (a capsule, with a key like EN-4) from idea to launch across every team's part of it (its components, like Tech or Marketing). Each component has an owner, a status, a due date and work items. You act as the person who connected you, with exactly their permissions; your changes show in Capsule as made by them via you. Start with get_needs_attention for what needs them, or search_capsules and get_capsule.",
});

const handler = withMcpAuth(
  (req) => {
    const acting = (req.auth?.extra as { acting?: Acting } | undefined)?.acting;
    if (!acting) return new Response("Unauthorized", { status: 401 });
    return actingAs.run(acting, () => mcp(req));
  },
  verifyAppToken,
  { required: true, resourceMetadataPath: "/.well-known/oauth-protected-resource/mcp" },
);

export { handler as GET, handler as POST, handler as DELETE };
