import type { Metadata } from "next";
import { Suspense } from "react";
import type { ComponentColor } from "@/lib/design";
import { createClient } from "@/lib/supabase/server";
import { WelcomeMotion } from "./welcome-motion";

/** Up to this many beads; more would crowd the card. */
const MAX_BEADS = 8;

export const metadata: Metadata = { title: "Welcome" };

/** Greets the person by first name; invited people hear how much is waiting for them. */
async function Greeting() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string;
  const [{ data: me }, { count: items }, { count: components }, { data: org }, { data: types }] =
    await Promise.all([
      supabase.from("users").select("name").eq("id", userId).single(),
      supabase
        .from("work_items")
        .select("id", { count: "exact", head: true })
        .eq("assignee_id", userId)
        .eq("done", false),
      supabase
        .from("components")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", userId)
        .neq("status", "done"),
      supabase.from("orgs").select("created_by").limit(1).maybeSingle(),
      // The org's components, each with the color and icon set for it.
      supabase
        .from("component_types")
        .select("id, name, color, icon")
        .is("archived_at", null)
        .order("position")
        .limit(MAX_BEADS),
    ]);
  const first = me?.name?.trim().split(/\s+/)[0] || "there";
  const waiting = (items ?? 0) + (components ?? 0);
  const createdOrg = org?.created_by === userId;
  return (
    <WelcomeMotion
      title={`Welcome to Capsule, ${first}`}
      line={
        waiting > 0 && !createdOrg
          ? `Your homepage already has ${waiting} thing${waiting === 1 ? "" : "s"} waiting for you.`
          : "Your homepage shows what needs you. Start your first capsule from there."
      }
      beads={(types ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color as ComponentColor,
        icon: t.icon,
      }))}
    />
  );
}

/** The welcome animation after onboarding, then Home. */
export default function WelcomePage() {
  return (
    <Suspense fallback={<main className="min-h-dvh" />}>
      <Greeting />
    </Suspense>
  );
}
