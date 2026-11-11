/**
 * Where each person is allowed to be, based on where they stand
 * (public.signup_status in the database, or signed out).
 * Returns the path to redirect to, or null to let the request through.
 */

export type AccessStatus =
  | "signed_out"
  | "member" // in an org that has finished setting up
  | "setting_up" // in an org still in onboarding
  | "approved" // may create an org
  | "invited" // has an open invitation (joining arrives in step 3b)
  | "not_approved";

/** Pages anyone can open, signed in or not. */
const PUBLIC = ["/login", "/auth/"];

/** The one page (or area) each status belongs on, outside the app itself. */
export function homeFor(status: Exclude<AccessStatus, "signed_out">): string {
  switch (status) {
    case "member":
      return "/";
    case "setting_up":
    case "approved":
      return "/onboarding";
    case "invited":
      return "/join";
    case "not_approved":
      return "/invite-only";
  }
}

const startsWith = (path: string, prefix: string) =>
  prefix.endsWith("/") ? path.startsWith(prefix) : path === prefix || path.startsWith(prefix + "/");

export function redirectFor(status: AccessStatus, pathname: string): string | null {
  if (pathname.startsWith("/auth/")) return null;

  if (status === "signed_out") {
    if (PUBLIC.some((p) => startsWith(pathname, p))) return null;
    return pathname === "/" ? "/login" : `/login?next=${encodeURIComponent(pathname)}`;
  }

  const home = homeFor(status);

  if (status === "member") {
    const notForMembers = ["/login", "/onboarding", "/join", "/invite-only"];
    return notForMembers.some((p) => startsWith(pathname, p)) ? home : null;
  }

  // Everyone else has exactly one place to be until they're in an org.
  return startsWith(pathname, home) ? null : home;
}

/** Only follow `next` links that stay on this site. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}
