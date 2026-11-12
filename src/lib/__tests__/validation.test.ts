import { describe, expect, it } from "vitest";
import { isEmail, parseInvites, prefixError, suggestPrefix } from "../validation";

describe("validation", () => {
  it("checks emails", () => {
    expect(isEmail("dana@acme.com")).toBe(true);
    expect(isEmail("dana@acme")).toBe(false);
    expect(isEmail("not an email")).toBe(false);
  });

  it("suggests key prefixes", () => {
    expect(suggestPrefix("Engineering", [])).toBe("EN");
    expect(suggestPrefix("Partner Programs", [])).toBe("PP");
    expect(suggestPrefix("Risk & Compliance", [])).toBe("RC");
    expect(suggestPrefix("Engineering", ["EN"])).toBe("ENA");
  });

  it("checks key prefixes", () => {
    expect(prefixError("", [])).toBe("Add a key prefix.");
    expect(prefixError("E", [])).toBe("Use 2 to 4 letters.");
    expect(prefixError("ENGIN", [])).toBe("Use 2 to 4 letters.");
    expect(prefixError("en", ["EN"])).toBe("Another space already uses EN.");
    expect(prefixError("pp", ["EN"])).toBe("");
  });

  it("parses invite lists", () => {
    expect(parseInvites("a@x.com, B@x.com", [])).toEqual({
      emails: ["a@x.com", "b@x.com"],
      error: "",
    });
    expect(parseInvites("a@x.com, nope", []).error).toBe("“nope” isn’t a valid email address.");
    expect(parseInvites("a@x.com", ["a@x.com"]).error).toBe("a@x.com is already on the list.");
  });
});

import { fingerprintOf, looksLikeInviteCode, newInviteCode } from "../invite-links";

describe("invite link codes", () => {
  it("are long, random and URL-safe", () => {
    const a = newInviteCode();
    expect(looksLikeInviteCode(a)).toBe(true);
    expect(newInviteCode()).not.toBe(a);
  });
  it("are stored only as a fingerprint", () => {
    expect(fingerprintOf("abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprintOf("abc")).not.toContain("abc");
  });
  it("reject anything that isn't a code", () => {
    expect(looksLikeInviteCode("../../etc")).toBe(false);
    expect(looksLikeInviteCode("short")).toBe(false);
  });
});

import { daysUntil, fmtDate } from "../dates";

describe("dates", () => {
  const today = new Date(2026, 10, 11); // Nov 11 2026
  it("formats like the prototype", () => {
    expect(fmtDate("2026-12-01", today)).toBe("Dec 1");
    expect(fmtDate("2027-01-15", today)).toBe("Jan 15, 2027");
    expect(fmtDate(null, today)).toBe("");
  });
  it("counts days to a date", () => {
    expect(daysUntil("2026-11-11", today)).toBe(0);
    expect(daysUntil("2026-11-21", today)).toBe(10);
    expect(daysUntil("2026-11-01", today)).toBe(-10);
  });
});

import { fmtRelative } from "../dates";

describe("relative times", () => {
  const now = new Date(2026, 10, 12, 15, 0);
  it("reads like the prototype", () => {
    expect(fmtRelative(new Date(2026, 10, 12, 14, 59, 30).toISOString(), now)).toBe("Just now");
    expect(fmtRelative(new Date(2026, 10, 12, 14, 40).toISOString(), now)).toBe("20m ago");
    expect(fmtRelative(new Date(2026, 10, 12, 9, 0).toISOString(), now)).toBe("6h ago");
    expect(fmtRelative(new Date(2026, 10, 11, 18, 0).toISOString(), now)).toBe("Yesterday");
    expect(fmtRelative(new Date(2026, 10, 3, 10, 0).toISOString(), now)).toBe("Nov 3");
  });
});
