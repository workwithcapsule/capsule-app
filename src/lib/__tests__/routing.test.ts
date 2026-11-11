import { describe, expect, it } from "vitest";
import { redirectFor, safeNext } from "../routing";

describe("who lands where", () => {
  it.each([
    ["signed_out", "/", "/login"],
    ["signed_out", "/capsules", "/login?next=%2Fcapsules"],
    ["signed_out", "/login", null],
    ["signed_out", "/auth/confirm", null],
    ["member", "/", null],
    ["member", "/capsules", null],
    ["member", "/welcome", null],
    ["member", "/login", "/"],
    ["member", "/onboarding", "/"],
    ["setting_up", "/", "/onboarding"],
    ["setting_up", "/onboarding", null],
    ["setting_up", "/welcome", "/onboarding"],
    ["approved", "/capsules", "/onboarding"],
    ["approved", "/login", "/onboarding"],
    ["invited", "/", "/join"],
    ["invited", "/join", null],
    ["not_approved", "/", "/invite-only"],
    ["not_approved", "/onboarding", "/invite-only"],
    ["not_approved", "/invite-only", null],
    ["not_approved", "/auth/signout", null],
  ] as const)("%s at %s goes to %s", (status, path, expected) => {
    expect(redirectFor(status, path)).toBe(expected);
  });

  it("only follows links back into this site", () => {
    expect(safeNext("/capsules")).toBe("/capsules");
    expect(safeNext("https://evil.test")).toBe("/");
    expect(safeNext("//evil.test")).toBe("/");
    expect(safeNext(null)).toBe("/");
  });
});
