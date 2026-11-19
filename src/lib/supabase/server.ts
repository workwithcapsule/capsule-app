import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { actingAs, type Acting } from "./bearer";
import { supabaseEnv } from "./env";

/**
 * Supabase for Server Components, Server Actions and Route Handlers, signed
 * in as the person making the request. Row-level security applies.
 *
 * During an MCP request (an AI app acting for someone), it signs in with the
 * app's token for that person instead of cookies; see ./bearer.
 */
export async function createClient() {
  const acting = actingAs.getStore();
  if (acting) return clientFor(acting);
  return cookieClient();
}

async function cookieClient() {
  // Only ever run for a real request: the client reads the clock and the
  // person's cookies, which can't be part of a page prepared ahead of time.
  await connection();
  const cookieStore = await cookies();
  const { url, key } = supabaseEnv();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, which can't set cookies. The proxy
          // refreshes sessions, so this is safe to ignore.
        }
      },
    },
  });
}

/** Signed in with an AI app's token. The token was checked by the MCP route. */
function clientFor(acting: Acting) {
  const { url, key } = supabaseEnv();
  const client = createSupabaseClient(url, key, {
    global: { headers: { Authorization: `Bearer ${acting.token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  // Loaders ask "who is signed in?" with getClaims(); answer from the
  // already-checked token rather than a stored session.
  const getClaims = client.auth.getClaims.bind(client.auth);
  client.auth.getClaims = ((jwt?: string) =>
    jwt
      ? getClaims(jwt)
      : Promise.resolve({
          data: { claims: acting.claims, header: {}, signature: new Uint8Array() },
          error: null,
        })) as typeof client.auth.getClaims;
  return client as unknown as Awaited<ReturnType<typeof cookieClient>>;
}
