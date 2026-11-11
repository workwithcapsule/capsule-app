import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CenteredPage } from "@/components/centered-page";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Welcome" };

async function Greeting() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const { data: me } = await supabase
    .from("users")
    .select("name")
    .eq("id", claims?.claims?.sub as string)
    .single();
  const first = me?.name?.trim().split(/\s+/)[0] || "there";
  return <>Welcome to Capsule, {first}</>;
}

/** The short welcome animation after onboarding, then Home. */
export default function WelcomePage() {
  return (
    <CenteredPage className="max-w-[520px] items-center gap-3.5 text-center">
      <h1 className="animate-lift-in text-[32px] leading-[38px] font-semibold tracking-[-0.02em]">
        <Suspense fallback="Welcome to Capsule">
          <Greeting />
        </Suspense>
      </h1>
      <p className="animate-fade-in text-[15px] text-muted-foreground">
        Your homepage shows what needs you. Start your first capsule from there.
      </p>
      <Button asChild variant="primary" size="lg" className="animate-fade-in">
        <Link href="/">Go to your homepage</Link>
      </Button>
    </CenteredPage>
  );
}
