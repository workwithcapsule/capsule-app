import type { Metadata } from "next";
import { Suspense } from "react";
import { CenteredPage, SignOutButton } from "@/components/centered-page";
import { loadJoin } from "./data";
import { JoinFlow } from "./flow";

export const metadata: Metadata = { title: "Join your team" };

async function Join() {
  const initial = await loadJoin();
  if (!initial) {
    // The invitation was withdrawn between signing in and opening this page.
    return (
      <CenteredPage>
        <h1 className="text-[28px] leading-[34px] font-semibold tracking-[-0.02em]">
          This invitation is no longer open
        </h1>
        <p className="text-muted-foreground">Ask whoever invited you to send a new one.</p>
        <SignOutButton />
      </CenteredPage>
    );
  }
  return <JoinFlow initial={initial} />;
}

export default function JoinPage() {
  return (
    <Suspense>
      <Join />
    </Suspense>
  );
}
