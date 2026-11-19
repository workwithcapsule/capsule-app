import { describe, expect, it } from "vitest";
import { jiraKeyFrom, statusFromJira } from "@/lib/jira/issue";

describe("jiraKeyFrom", () => {
  it("reads a key, in any case", () => {
    expect(jiraKeyFrom("ENG-142")).toBe("ENG-142");
    expect(jiraKeyFrom(" eng-142 ")).toBe("ENG-142");
  });

  it("reads a key from a Jira link", () => {
    expect(jiraKeyFrom("https://acme.atlassian.net/browse/ENG-142")).toBe("ENG-142");
    expect(
      jiraKeyFrom(
        "https://acme.atlassian.net/jira/software/projects/ENG/boards/1?selectedIssue=ENG-7",
      ),
    ).toBe("ENG-7");
  });

  it("ignores everything else", () => {
    expect(jiraKeyFrom("Load test the API")).toBeNull();
    expect(jiraKeyFrom("EN 4")).toBeNull();
    expect(jiraKeyFrom("https://example.com/browse/ENG-1")).toBeNull();
    expect(jiraKeyFrom("http://acme.atlassian.net/browse/ENG-1")).toBeNull();
    expect(jiraKeyFrom("")).toBeNull();
  });
});

describe("statusFromJira", () => {
  it("follows Jira's status category, with review by name", () => {
    expect(statusFromJira("new", "To Do")).toBe("not_started");
    expect(statusFromJira("indeterminate", "In Progress")).toBe("in_progress");
    expect(statusFromJira("indeterminate", "Code Review")).toBe("in_review");
    expect(statusFromJira("done", "Done")).toBe("done");
    expect(statusFromJira(undefined, undefined)).toBe("not_started");
  });
});
