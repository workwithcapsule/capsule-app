import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";

/*
 * Monitoring in the browser. Each is off until its key is set in Vercel:
 * - Sentry (NEXT_PUBLIC_SENTRY_DSN): errors people hit.
 * - PostHog (NEXT_PUBLIC_POSTHOG_KEY): page views, session replays (with
 *   everything typed hidden) and feature flags. Signed-in people are
 *   identified in components/monitoring.tsx. Product events are in
 *   lib/analytics.ts, and crashes go to its error tracking too.
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
if (posthogKey) {
  posthog.init(posthogKey, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    defaults: "2025-05-24",
    person_profiles: "identified_only",
    session_recording: { maskAllInputs: true },
    // Error tracking: crashes and failed promises (not console messages).
    capture_exceptions: {
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
      capture_console_errors: false,
    },
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
