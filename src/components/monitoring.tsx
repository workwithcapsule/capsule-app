"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";

/**
 * Tells PostHog and Sentry who is signed in, so a session replay or an error
 * shows whose it was and which org. Does nothing until their keys are set.
 */
export function IdentifyPerson({
  user,
  org,
}: {
  user: { id: string; name: string; email: string };
  org: { id: string; name: string };
}) {
  useEffect(() => {
    if (!user.id) return;
    if (process.env.NEXT_PUBLIC_POSTHOG_KEY && process.env.NEXT_PUBLIC_POSTHOG_HOST) {
      posthog.identify(user.id, { name: user.name, email: user.email });
      if (org.id) posthog.group("org", org.id, { name: org.name });
    }
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) Sentry.setUser({ id: user.id });
  }, [user.id, user.name, user.email, org.id, org.name]);
  return null;
}

/** On sign-out: forget who this was, so the next person on the device starts fresh. */
export function forgetPerson() {
  if (process.env.NEXT_PUBLIC_POSTHOG_KEY && process.env.NEXT_PUBLIC_POSTHOG_HOST) posthog.reset();
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) Sentry.setUser(null);
}
