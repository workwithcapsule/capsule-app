import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Everything except Next.js internals, static files, scheduled jobs
    // (/api/cron checks its own secret; it has no signed-in person) and the
    // MCP server with its sign-in metadata (AI apps send their own token).
    "/((?!_next/static|_next/image|api/cron/|mcp(?:/|$)|\\.well-known/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
