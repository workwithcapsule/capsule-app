import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CenteredPage } from "@/components/centered-page";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Welcome" };

/** Greets the person by first name; invited people hear how much is waiting for them. */
async function Greeting() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string;
  const [{ data: me }, { count: items }, { count: components }, { data: org }] = await Promise.all([
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
  ]);
  const first = me?.name?.trim().split(/\s+/)[0] || "there";
  const waiting = (items ?? 0) + (components ?? 0);
  const createdOrg = org?.created_by === userId;
  return (
    <>
      <h1 className="animate-lift-in text-[32px] leading-[38px] font-semibold tracking-[-0.02em]">
        Welcome to Capsule, {first}
      </h1>
      <p className="animate-fade-in text-[15px] text-muted-foreground">
        {waiting > 0 && !createdOrg
          ? `Your homepage already has ${waiting} thing${waiting === 1 ? "" : "s"} waiting for you.`
          : "Your homepage shows what needs you. Start your first capsule from there."}
      </p>
    </>
  );
}

/** The short welcome animation after onboarding, then Home. */
export default function WelcomePage() {
  return (
    <CenteredPage className="max-w-[520px] items-center gap-3.5 text-center">
      <Suspense
        fallback={
          <h1 className="text-[32px] leading-[38px] font-semibold tracking-[-0.02em] opacity-0">
            Welcome to Capsule
          </h1>
        }
      >
        <Greeting />
      </Suspense>
      <Button asChild variant="primary" size="lg" className="animate-fade-in">
        <Link href="/">Go to your homepage</Link>
      </Button>
    </CenteredPage>
  );
}
