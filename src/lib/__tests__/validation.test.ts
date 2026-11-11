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
