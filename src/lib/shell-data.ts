import "server-only";
import { examplesAllowed } from "@/lib/examples/seed";
import { createClient } from "@/lib/supabase/server";

export type ShellData = {
  user: { id: string; name: string; initials: string; email: string };
  org: { id: string; name: string; isAdmin: boolean };
  spaces: { key: string; name: string }[];
  /** Shows the Example data link (EXAMPLE_DATA_EMAILS). */
  examples: boolean;
  /** How many rows are in Needs your attention (shown next to Home). */
  attention: number;
};

export const EMPTY_SHELL: ShellData = {
  user: { id: "", name: "", initials: "", email: "" },
  org: { id: "", name: "", isAdmin: false },
  spaces: [],
  examples: false,
  attention: 0,
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

  const [{ data: me }, { data: membership }, { data: spaces }, { data: attention }] =
    await Promise.all([
      supabase.from("users").select("name, email").eq("id", userId).single(),
      supabase
        .from("org_members")
        .select("org_id, role, orgs(name)")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("space_members")
        .select("spaces(name, key_prefix)")
        .eq("user_id", userId)
        .order("created_at"),
      supabase.rpc("needs_attention").select("kind"),
    ]);

  const name = me?.name ?? "";
  const email = me?.email ?? "";
  const org = membership?.orgs as unknown as { name: string } | null;
  return {
    user: { id: userId, name: name || email, initials: initialsOf(name, email), email },
    org: {
      id: membership?.org_id ?? "",
      name: org?.name ?? "",
      isAdmin: membership?.role === "admin",
    },
    examples: examplesAllowed(email),
    attention: Array.isArray(attention) ? attention.length : 0,
    spaces: (spaces ?? [])
      .map((r) => r.spaces as unknown as { name: string; key_prefix: string } | null)
      .filter((s): s is { name: string; key_prefix: string } => Boolean(s))
      .map((s) => ({ key: s.key_prefix, name: s.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
