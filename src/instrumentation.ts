import * as Sentry from "@sentry/nextjs";

/*
 * Error monitoring on the server (Sentry). Off until SENTRY_DSN is set in
 * Vercel. Only errors are sent, with no request bodies or cookies, so
 * people's work stays out of it.
 */
export async function register() {
  const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? "development",
    tracesSampleRate: 0,
    sendDefaultPii: false,
  });
}

export const onRequestError = Sentry.captureRequestError;
