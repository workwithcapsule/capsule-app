import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { redirectFor, type AccessStatus } from "@/lib/routing";
import { supabaseEnv } from "./env";

/**
 * Runs before every page: refreshes the sign-in session (so people aren't
 * signed out at random), then sends each person to the page they belong on.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, key } = supabaseEnv();

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  // Keep this call directly after creating the client: it refreshes the session.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/auth/")) return response;

  let status: AccessStatus = "signed_out";
  if (signedIn) {
    const { data: s, error } = await supabase.rpc("signup_status");
    status = error ? "not_approved" : (s as AccessStatus);
  }

  const target = redirectFor(status, pathname);
  if (!target) return response;

  const redirect = NextResponse.redirect(new URL(target, request.url));
  // Carry over any refreshed session cookies.
  response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
  return redirect;
}
