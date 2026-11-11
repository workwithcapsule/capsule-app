import "server-only";

/**
 * Sending email through Resend.
 *
 * Safety first: unless EMAIL_MODE is "live", Capsule is in test mode and
 * only emails addresses on EMAIL_TEST_ALLOWLIST (comma-separated). Gmail-style
 * "+" variants count as the same address, so christina+dana@… is allowed
 * when christina@… is. Nothing is sent at all without RESEND_API_KEY.
 */

export type EmailMode = "test" | "live";

export type SendResult =
  | { status: "sent"; id: string }
  | { status: "skipped"; reason: "test-mode" | "not-configured" }
  | { status: "failed"; error: string };

export function emailMode(): EmailMode {
  return process.env.EMAIL_MODE === "live" ? "live" : "test";
}

/** lowercased, with any "+tag" removed from the part before the @. */
export function baseAddress(email: string): string {
  const [local, domain] = email.trim().toLowerCase().split("@");
  return `${local.split("+")[0]}@${domain}`;
}

export function testAllowlist(): string[] {
  return (process.env.EMAIL_TEST_ALLOWLIST ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)
    .map(baseAddress);
}

export function mayEmail(to: string): boolean {
  if (emailMode() === "live") return true;
  return testAllowlist().includes(baseAddress(to));
}

const DEFAULT_FROM = "Christina from Capsule <hello@workwithcapsule.com>";

export async function sendEmail(message: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<SendResult> {
  if (!mayEmail(message.to)) return { status: "skipped", reason: "test-mode" };
  const key = process.env.RESEND_API_KEY;
  if (!key) return { status: "skipped", reason: "not-configured" };

  try {
    const res = await fetch(`${process.env.RESEND_API_URL ?? "https://api.resend.com"}/emails`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? DEFAULT_FROM,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok || !body.id)
      return { status: "failed", error: body.message ?? `HTTP ${res.status}` };
    return { status: "sent", id: body.id };
  } catch (e) {
    return { status: "failed", error: (e as Error).message };
  }
}
