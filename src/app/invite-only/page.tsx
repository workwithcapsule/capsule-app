import type { Metadata } from "next";
import { CenteredPage, SignOutButton } from "@/components/centered-page";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Invite-only for now" };

export default function InviteOnlyPage() {
  return (
    <CenteredPage>
      <span className="text-lg leading-6 font-semibold tracking-[-0.02em]">Capsule</span>
      <div className="flex flex-col gap-2">
        <h1 className="text-[28px] leading-[34px] font-semibold tracking-[-0.02em]">
          Capsule is invite-only for now
        </h1>
        <p className="text-[15px] leading-[22px] text-muted-foreground">
          We’re opening Capsule to our Founding Builders teams first. Join the waitlist and we’ll be
          in touch, or ask a teammate who uses Capsule to invite you.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Button asChild variant="primary" size="lg">
          <a href="https://workwithcapsule.com">Join the waitlist</a>
        </Button>
        <SignOutButton />
      </div>
    </CenteredPage>
  );
}
