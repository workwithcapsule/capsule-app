import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { supabaseEnv } from "./env";

/**
 * Supabase for Server Components, Server Actions and Route Handlers, signed
 * in as the person making the request. Row-level security applies.
 */
export async function createClient() {
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
