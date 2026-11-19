import type { Metadata } from "next";
import { Suspense } from "react";
import { Page } from "@/components/page";
import type { ComponentColor } from "@/lib/design";
import { jiraConfigured } from "@/lib/jira/client";
import { siteOrigin } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { SettingsView } from "./settings-view";

export const metadata: Metadata = { title: "Settings" };

async function Content({ searchParams }: { searchParams: PageProps<"/settings">["searchParams"] }) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) return null;
  const [{ data: me }, { data: membership }, params, { data: apps }, origin, { data: jira }] =
    await Promise.all([
      supabase.from("users").select("name, email, email_notifications").eq("id", userId).single(),
      supabase
        .from("org_members")
        .select("org_id, role")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle(),
      searchParams,
      supabase.rpc("my_connected_apps"),
      siteOrigin(),
      supabase
        .from("integrations")
        .select("status, site_name, site_url, account_name")
        .eq("user_id", userId)
        .eq("tool", "jira")
        .maybeSingle(),
    ]);
  const isAdmin = membership?.role === "admin";
  const { data: types } = isAdmin
    ? await supabase
        .from("component_types")
        .select("id, name, description, color, icon")
        .eq("org_id", membership!.org_id)
        .is("archived_at", null)
        .order("position")
    : { data: [] };
  const tab = typeof params.tab === "string" ? params.tab : "profile";

  return (
    <SettingsView
      initialTab={
        tab === "components" && isAdmin
          ? "components"
          : tab === "appearance"
            ? "appearance"
            : tab === "apps"
              ? "apps"
              : "profile"
      }
      name={me?.name ?? ""}
      email={me?.email ?? ""}
      emailNotifications={me?.email_notifications !== false}
      orgId={membership?.org_id ?? null}
      isAdmin={isAdmin}
      mcpUrl={`${origin}/mcp`}
      jira={{
        configured: jiraConfigured(),
        connected: Boolean(jira),
        reconnect: jira?.status === "needs_reconnect",
        siteName: jira?.site_name ?? null,
        siteUrl: jira?.site_url ?? null,
        accountName: jira?.account_name ?? null,
      }}
      apps={(
        (apps ?? []) as {
          client_id: string;
          name: string;
          connected_at: string;
          last_used_at: string | null;
        }[]
      ).map((a) => ({
        clientId: a.client_id,
        name: a.name,
        connectedAt: a.connected_at,
        lastUsedAt: a.last_used_at,
      }))}
      components={(types ?? []).map((t) => ({
        id: t.id,
        key: t.id,
        name: t.name,
        description: t.description ?? "",
        color: t.color as ComponentColor,
        icon: t.icon ?? "box",
      }))}
    />
  );
}

/** Settings (step 11): Profile, Appearance, Connected apps (step 13), and Org components for org admins. */
export default function SettingsPage({ searchParams }: PageProps<"/settings">) {
  return (
    <Page title="Settings">
      <Suspense>
        <Content searchParams={searchParams} />
      </Suspense>
    </Page>
  );
}
