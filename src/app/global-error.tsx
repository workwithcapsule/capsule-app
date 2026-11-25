"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { trackError } from "@/lib/analytics";

/**
 * The last-resort error page, when even the app's layout fails. Reports the
 * error (if Sentry is on) and offers a reload. Plain styles: the app's own
 * stylesheet may not have loaded.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) Sentry.captureException(error);
    trackError(error);
  }, [error]);
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "#FAF9F7",
          color: "#2A2523",
          fontFamily: "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
          padding: 16,
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ fontSize: 15, color: "#5F5854", margin: "0 0 20px" }}>
            We’ve been told about it. Reload the page to try again.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              border: 0,
              borderRadius: 999,
              background: "#DCD6D2",
              color: "#2A2523",
              fontSize: 14,
              fontWeight: 500,
              padding: "11px 18px",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
