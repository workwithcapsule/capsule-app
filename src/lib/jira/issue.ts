import type { ItemStatus } from "@/lib/work-items";

/*
 * Jira helpers that run anywhere (no secrets): reading a key out of what
 * someone pasted, and turning Jira's status into Capsule's.
 */

const KEY = /^[A-Z][A-Z0-9_]{0,19}-\d{1,10}$/;

/**
 * A Jira issue key from a key ("eng-142") or a Jira link
 * (".../browse/ENG-142", "...?selectedIssue=ENG-142"), or null.
 */
export function jiraKeyFrom(text: string): string | null {
  const t = text.trim();
  if (!t || /\s/.test(t)) return null;
  if (KEY.test(t.toUpperCase()) && /^[a-z][a-z0-9_]*-\d+$/i.test(t)) return t.toUpperCase();
  let url: URL;
  try {
    url = new URL(t);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !/\.(atlassian\.net|jira\.com)$/i.test(url.hostname))
    return null;
  const fromPath = /\/browse\/([A-Za-z][A-Za-z0-9_]*-\d+)/.exec(url.pathname)?.[1];
  const fromQuery = url.searchParams.get("selectedIssue");
  const k = (fromPath ?? fromQuery ?? "").toUpperCase();
  return KEY.test(k) ? k : null;
}

/** Capsule's status for a Jira status: by its category, and "review" in the name. */
export function statusFromJira(
  category: string | null | undefined,
  name: string | null | undefined,
): ItemStatus {
  if (category === "done") return "done";
  if (/review/i.test(name ?? "")) return "in_review";
  if (category === "indeterminate") return "in_progress";
  return "not_started";
}
