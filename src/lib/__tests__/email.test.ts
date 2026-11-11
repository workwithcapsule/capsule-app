import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { baseAddress, mayEmail, sendEmail } = await import("../email/send");
const { inviteEmail } = await import("../email/invite");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("email safety", () => {
  it("treats +tags as the same address", () => {
    expect(baseAddress("Christina+Dana@Gmail.com")).toBe("christina@gmail.com");
  });

  it("in test mode only emails the allowlist", () => {
    vi.stubEnv("EMAIL_MODE", "");
    vi.stubEnv("EMAIL_TEST_ALLOWLIST", "owner@example.com");
    expect(mayEmail("owner@example.com")).toBe(true);
    expect(mayEmail("owner+dana@example.com")).toBe(true);
    expect(mayEmail("dana@acme.com")).toBe(false);
  });

  it("in test mode with no allowlist, emails nobody", () => {
    vi.stubEnv("EMAIL_MODE", "");
    vi.stubEnv("EMAIL_TEST_ALLOWLIST", "");
    expect(mayEmail("anyone@example.com")).toBe(false);
  });

  it("in live mode emails anyone", () => {
    vi.stubEnv("EMAIL_MODE", "live");
    expect(mayEmail("dana@acme.com")).toBe(true);
  });

  it("never calls Resend for a blocked address", async () => {
    vi.stubEnv("EMAIL_MODE", "test");
    vi.stubEnv("EMAIL_TEST_ALLOWLIST", "owner@example.com");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const r = await sendEmail({ to: "dana@acme.com", subject: "x", html: "x", text: "x" });
    expect(r).toEqual({ status: "skipped", reason: "test-mode" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("doesn't send without a Resend key", async () => {
    vi.stubEnv("EMAIL_MODE", "live");
    vi.stubEnv("RESEND_API_KEY", "");
    const r = await sendEmail({ to: "dana@acme.com", subject: "x", html: "x", text: "x" });
    expect(r).toEqual({ status: "skipped", reason: "not-configured" });
  });
});

describe("invite email", () => {
  it("names the inviter and org, and escapes them", () => {
    const m = inviteEmail({
      inviterName: "Christina",
      orgName: "Acme <Partners>",
      email: "dana@acme.com",
      joinUrl: "https://app.test/login?email=dana%40acme.com",
    });
    expect(m.subject).toBe("Christina invited you to Acme <Partners> on Capsule");
    expect(m.html).toContain("Acme &lt;Partners&gt;");
    expect(m.text).toContain("https://app.test/login?email=dana%40acme.com");
  });
});
