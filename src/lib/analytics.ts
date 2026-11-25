"use client";

import posthog from "posthog-js";

/*
 * Product events for PostHog (browser only). Each does nothing until
 * NEXT_PUBLIC_POSTHOG_KEY is set. Properties are counts and choices only:
 * never names, emails, titles or anything someone typed. Who did it comes
 * from the signed-in person (components/monitoring.tsx).
 */

type Events = {
  capsule_shaping_requested: { prompt_length: number; suggested_component_count: number };
  capsule_created: {
    creation_source: "ai_suggestion" | "manual";
    component_count: number;
    work_item_count: number;
    has_target_date: boolean;
  };
  work_item_completion_changed: { completed: boolean };
  attachment_added: { attachment_type: string };
  invitees_added: { invitee_count: number };
  invitations_sent: {
    send_type: "batch" | "resend";
    sent_count: number;
    held_count: number;
    failed_count: number;
  };
  space_created: { has_description: boolean };
  space_membership_changed: { membership_action: "joined" | "left" };
};

const on = () => Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY);

export function track<E extends keyof Events>(event: E, properties: Events[E]) {
  if (!on()) return;
  try {
    posthog.capture(event, properties);
  } catch {
    // Analytics must never break the app.
  }
}

/** Reports an error to PostHog's error tracking (alongside Sentry). */
export function trackError(error: unknown) {
  if (!on()) return;
  try {
    posthog.captureException(error);
  } catch {}
}
