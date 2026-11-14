import "server-only";
import { examplesAllowed } from "@/lib/examples/seed";
import { createClient } from "@/lib/supabase/server";

export type ShellData = {
  user: { name: string; initials: string; email: string };
  org: { name: string; isAdmin: boolean };
  spaces: { key: string; name: string }[];
  /** Shows the Example data link (EXAMPLE_DATA_EMAILS). */
  examples: boolean;
};

export const EMPTY_SHELL: ShellData = {
  user: { name: "", initials: "", email: "" },
  org: { name: "", isAdmin: false },
  spaces: [],
  examples: false,
};

function initialsOf(name: string, email: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length) return words[0][0].toUpperCase();
  return email.charAt(0).toUpperCase();
}

export function spaceHref(key: string) {
  return `/spaces/${key.toLowerCase()}`;
}

/** The signed-in person, their org and the spaces they've joined, for the sidebar. */
export async function loadShellData(): Promise<ShellData> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) return EMPTY_SHELL;

  const [{ data: me }, { data: membership }, { data: spaces }] = await Promise.all([
    supabase.from("users").select("name, email").eq("id", userId).single(),
    supabase
      .from("org_members")
      .select("role, orgs(name)")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("space_members")
      .select("spaces(name, key_prefix)")
      .eq("user_id", userId)
      .order("created_at"),
  ]);

  const name = me?.name ?? "";
  const email = me?.email ?? "";
  const org = membership?.orgs as unknown as { name: string } | null;
  return {
    user: { name: name || email, initials: initialsOf(name, email), email },
    org: { name: org?.name ?? "", isAdmin: membership?.role === "admin" },
    examples: examplesAllowed(email),
    spaces: (spaces ?? [])
      .map((r) => r.spaces as unknown as { name: string; key_prefix: string } | null)
      .filter((s): s is { name: string; key_prefix: string } => Boolean(s))
      .map((s) => ({ key: s.key_prefix, name: s.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
