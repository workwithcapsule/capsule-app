import type { Metadata } from "next";
import { CenteredPage, SignOutButton } from "@/components/centered-page";

export const metadata: Metadata = { title: "You’re invited" };

/** Placeholder until step 3b builds the invited person's flow. */
export default function JoinPage() {
  return (
    <CenteredPage>
      <span className="text-lg leading-6 font-semibold tracking-[-0.02em]">Capsule</span>
      <div className="flex flex-col gap-2">
        <h1 className="text-[28px] leading-[34px] font-semibold tracking-[-0.02em]">
          You’ve been invited
        </h1>
        <p className="text-[15px] leading-[22px] text-muted-foreground">
          Joining your team’s Capsule is almost ready. We’ll email you as soon as you can come in.
        </p>
      </div>
      <SignOutButton />
    </CenteredPage>
  );
}
