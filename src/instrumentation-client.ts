import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";

/*
 * Monitoring in the browser. Each is off until its key is set in Vercel:
 * - Sentry (NEXT_PUBLIC_SENTRY_DSN): errors people hit.
 * - PostHog (NEXT_PUBLIC_POSTHOG_KEY): page views, session replays (with
 *   everything typed hidden) and feature flags. Signed-in people are
 *   identified in components/monitoring.tsx.
 */

const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
    tracesSampleRate: 0,
    sendDefaultPii: false,
  });
}

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;

if (posthogKey && posthogHost) {
  posthog.init(posthogKey, {
    api_host: posthogHost,
    defaults: "2025-05-24",
    person_profiles: "identified_only",
    session_recording: { maskAllInputs: true },
    capture_exceptions: {
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
      capture_console_errors: false,
    },
  });
} else if (process.env.NODE_ENV === "development") {
  const missingVariable = posthogKey ? "NEXT_PUBLIC_POSTHOG_HOST" : "NEXT_PUBLIC_POSTHOG_KEY";
  throw new Error(
    `${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`,
  );
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
