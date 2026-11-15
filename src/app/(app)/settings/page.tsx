import type { Metadata } from "next";
import { Suspense } from "react";
import { Page } from "@/components/page";
import type { ComponentColor } from "@/lib/design";
import { createClient } from "@/lib/supabase/server";
import { SettingsView } from "./settings-view";

export const metadata: Metadata = { title: "Settings" };

async function Content({ searchParams }: { searchParams: PageProps<"/settings">["searchParams"] }) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) return null;
  const [{ data: me }, { data: membership }, params] = await Promise.all([
    supabase.from("users").select("name, email, email_notifications").eq("id", userId).single(),
    supabase
      .from("org_members")
      .select("org_id, role")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle(),
    searchParams,
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
            : "profile"
      }
      name={me?.name ?? ""}
      email={me?.email ?? ""}
      emailNotifications={me?.email_notifications !== false}
      orgId={membership?.org_id ?? null}
      isAdmin={isAdmin}
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

/** Settings (step 11): Profile, Appearance, and Org components for org admins. */
export default function SettingsPage({ searchParams }: PageProps<"/settings">) {
  return (
    <Page title="Settings">
      <Suspense>
        <Content searchParams={searchParams} />
      </Suspense>
    </Page>
  );
}
