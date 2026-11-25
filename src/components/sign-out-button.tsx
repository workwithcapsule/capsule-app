"use client";

import { forgetPerson } from "@/components/monitoring";

/** Sign out, as a form so it works without JavaScript. Forgets who this was in PostHog and Sentry. */
export function SignOutButton({ className }: { className?: string }) {
  return (
    <form action="/auth/signout" method="post" className={className} onSubmit={forgetPerson}>
      <button
        type="submit"
        className="text-[13px] font-medium text-muted-foreground underline underline-offset-[3px] hover:text-foreground"
      >
        Sign out
      </button>
    </form>
  );
}
