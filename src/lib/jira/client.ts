import "server-only";
import { canEncrypt, open, seal } from "@/lib/secret-box";
import { createAdminClient } from "@/lib/supabase/admin";
import { statusFromJira } from "./issue";

/*
 * Jira (step 14, build-decisions.md 65–68). Each person connects their own
 * Jira account through Atlassian's OAuth 2.0 (3LO). Their tokens are
 * encrypted before they're stored in public.integrations, and only this
 * server code reads them, with the server's key. Capsule only reads from
 * Jira, never writes.
 */

const AUTH = () =>
  (process.env.ATLASSIAN_AUTH_URL ?? "https://auth.atlassian.com").replace(/\/$/, "");
const API = () => (process.env.ATLASSIAN_API_URL ?? "https://api.atlassian.com").replace(/\/$/, "");
export const JIRA_SCOPES = "read:jira-work read:jira-user offline_access";

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

/** Jira linking is set up: Atlassian app keys and the encryption key are in place. */
export function jiraConfigured(): boolean {
  return Boolean(
    process.env.ATLASSIAN_CLIENT_ID && process.env.ATLASSIAN_CLIENT_SECRET && canEncrypt(),
  );
}

export function authorizeUrl(state: string, redirectUri: string) {
  const q = new URLSearchParams({
    audience: "api.atlassian.com",
    client_id: process.env.ATLASSIAN_CLIENT_ID ?? "",
    scope: JIRA_SCOPES,
    redirect_uri: redirectUri,
    state,
    response_type: "code",
    prompt: "consent",
  });
  return `${AUTH()}/authorize?${q}`;
}

type Tokens = { access_token: string; refresh_token?: string; expires_in?: number };

async function tokenRequest(body: Record<string, string>): Promise<Tokens | null> {
  const res = await fetch(`${AUTH()}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.ATLASSIAN_CLIENT_ID,
      client_secret: process.env.ATLASSIAN_CLIENT_SECRET,
      ...body,
    }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const t = (await res.json()) as Tokens;
  return t.access_token ? t : null;
}

export function exchangeCode(code: string, redirectUri: string) {
  return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
}

type Site = { id: string; url: string; name: string };

/** The Jira sites the token can reach (Atlassian calls them "accessible resources"). */
export async function sitesFor(accessToken: string): Promise<Site[]> {
  const res = await fetch(`${API()}/oauth/token/accessible-resources`, {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const list = (await res.json()) as { id: string; url: string; name: string; scopes?: string[] }[];
  return list
    .filter((s) => !s.scopes || s.scopes.some((x) => x.includes("jira")))
    .map((s) => ({ id: s.id, url: s.url.replace(/\/$/, ""), name: s.name }));
}

/** Saves (or replaces) someone's Jira connection, with their tokens encrypted. */
export async function saveConnection(
  admin: Admin,
  input: {
    orgId: string;
    userId: string;
    tokens: Tokens;
    site: Site;
    accountId?: string;
    accountName?: string;
  },
) {
  const { error } = await admin.from("integrations").upsert(
    {
      org_id: input.orgId,
      user_id: input.userId,
      tool: "jira",
      site_id: input.site.id,
      site_url: input.site.url,
      site_name: input.site.name,
      account_id: input.accountId ?? null,
      account_name: input.accountName ?? null,
      access_token: seal(input.tokens.access_token),
      refresh_token: input.tokens.refresh_token ? seal(input.tokens.refresh_token) : null,
      expires_at: new Date(Date.now() + (input.tokens.expires_in ?? 3600) * 1000).toISOString(),
      status: "active",
    },
    { onConflict: "org_id,user_id,tool" },
  );
  return !error;
}

type Connection = {
  id: string;
  user_id: string;
  site_id: string;
  site_url: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  status: string;
};

const CONN = "id, user_id, site_id, site_url, access_token, refresh_token, expires_at, status";

export async function connectionOf(admin: Admin, userId: string): Promise<Connection | null> {
  const { data } = await admin
    .from("integrations")
    .select(CONN)
    .eq("user_id", userId)
    .eq("tool", "jira")
    .maybeSingle();
  return (data as Connection | null) ?? null;
}

/** A working access token, refreshing it (Atlassian rotates refresh tokens) when it's about to expire. */
async function accessToken(admin: Admin, conn: Connection): Promise<string | null> {
  if (conn.status !== "active") return null;
  const fresh = conn.expires_at && new Date(conn.expires_at).getTime() > Date.now() + 60_000;
  try {
    if (fresh) return open(conn.access_token);
    if (!conn.refresh_token) return null;
    const t = await tokenRequest({
      grant_type: "refresh_token",
      refresh_token: open(conn.refresh_token),
    });
    if (!t) {
      await admin.from("integrations").update({ status: "needs_reconnect" }).eq("id", conn.id);
      return null;
    }
    const update = {
      access_token: seal(t.access_token),
      refresh_token: t.refresh_token ? seal(t.refresh_token) : conn.refresh_token,
      expires_at: new Date(Date.now() + (t.expires_in ?? 3600) * 1000).toISOString(),
    };
    await admin.from("integrations").update(update).eq("id", conn.id);
    Object.assign(conn, update);
    return t.access_token;
  } catch {
    return null;
  }
}

class JiraError extends Error {
  constructor(public status: number) {
    super(`Jira answered ${status}`);
  }
}

async function jiraGet<T>(admin: Admin, conn: Connection, path: string): Promise<T> {
  const token = await accessToken(admin, conn);
  if (!token) throw new JiraError(401);
  const res = await fetch(`${API()}/ex/jira/${conn.site_id}/rest/api/3${path}`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new JiraError(res.status);
  return (await res.json()) as T;
}

/** The person's own account on their Jira site, for Settings. */
export async function jiraAccount(admin: Admin, conn: Connection) {
  try {
    const me = await jiraGet<{ accountId: string; displayName: string }>(admin, conn, "/myself");
    return { accountId: me.accountId, accountName: me.displayName };
  } catch {
    return {};
  }
}

export type JiraIssue = {
  id: string;
  key: string;
  title: string;
  url: string;
  statusName: string;
  statusCategory: string;
  assigneeName: string | null;
  assigneeEmail: string | null;
};

type RawIssue = {
  id: string;
  key: string;
  fields: {
    summary?: string;
    status?: { name?: string; statusCategory?: { key?: string } };
    assignee?: { displayName?: string; emailAddress?: string } | null;
  };
};

const toIssue = (siteUrl: string, r: RawIssue): JiraIssue => ({
  id: r.id,
  key: r.key,
  title: r.fields.summary?.trim() || r.key,
  url: `${siteUrl}/browse/${r.key}`,
  statusName: r.fields.status?.name ?? "",
  statusCategory: r.fields.status?.statusCategory?.key ?? "new",
  assigneeName: r.fields.assignee?.displayName ?? null,
  assigneeEmail: r.fields.assignee?.emailAddress?.toLowerCase() ?? null,
});

async function searchJql(
  admin: Admin,
  conn: Connection,
  jql: string,
  max: number,
): Promise<JiraIssue[]> {
  const q = new URLSearchParams({
    jql,
    fields: "summary,status,assignee",
    maxResults: String(max),
  });
  try {
    const data = await jiraGet<{ issues?: RawIssue[] }>(admin, conn, `/search/jql?${q}`);
    return (data.issues ?? []).map((r) => toIssue(conn.site_url, r));
  } catch (e) {
    // A key that doesn't exist (or you can't see) is a 400 from JQL: no results.
    if (e instanceof JiraError && e.status === 400) return [];
    throw e;
  }
}

const jqlString = (s: string) => `"${s.replace(/["\\]/g, "\\$&")}"`;

export type SearchResult =
  | { state: "not_configured" }
  | { state: "not_connected" }
  | { state: "reconnect" }
  | { state: "error" }
  | { state: "ok"; site: string; issues: JiraIssue[] };

/**
 * Issues matching a key or words, with the person's own Jira account. With
 * nothing typed: their recently updated issues.
 */
export async function searchIssues(userId: string, query: string): Promise<SearchResult> {
  if (!jiraConfigured()) return { state: "not_configured" };
  const admin = createAdminClient();
  if (!admin) return { state: "not_configured" };
  const conn = await connectionOf(admin, userId);
  if (!conn) return { state: "not_connected" };
  if (conn.status !== "active") return { state: "reconnect" };
  const q = query.trim().slice(0, 100);
  const key = /^[a-z][a-z0-9_]*-\d+$/i.test(q) ? q.toUpperCase() : null;
  const jql = key
    ? `key = ${key}`
    : q
      ? `text ~ ${jqlString(`${q}*`)} ORDER BY updated DESC`
      : "assignee = currentUser() OR reporter = currentUser() ORDER BY updated DESC";
  try {
    return { state: "ok", site: conn.site_url, issues: await searchJql(admin, conn, jql, 10) };
  } catch (e) {
    if (e instanceof JiraError && e.status === 401) return { state: "reconnect" };
    return { state: "error" };
  }
}

/** One issue by key, with the person's own Jira account (null if they can't see it). */
export async function fetchIssue(
  userId: string,
  key: string,
): Promise<JiraIssue | null | "reconnect"> {
  const admin = createAdminClient();
  if (!admin) return null;
  const conn = await connectionOf(admin, userId);
  if (!conn || conn.status !== "active") return "reconnect";
  try {
    const [issue] = await searchJql(admin, conn, `key = ${key}`, 1);
    return issue ?? null;
  } catch (e) {
    return e instanceof JiraError && e.status === 401 ? "reconnect" : null;
  }
}

/** Matches Jira assignees to people in the org by email. */
export async function peopleByEmail(admin: Admin, orgId: string, emails: string[]) {
  const wanted = [...new Set(emails.filter(Boolean))];
  if (!wanted.length) return new Map<string, string>();
  const { data } = await admin
    .from("org_members")
    .select("user_id, users!inner(email)")
    .eq("org_id", orgId)
    .in("users.email", wanted);
  return new Map(
    (data ?? []).map((m) => [
      ((m.users as unknown as { email: string }).email ?? "").toLowerCase(),
      m.user_id as string,
    ]),
  );
}

type LinkedRow = {
  id: string;
  org_id: string;
  title: string;
  source_key: string;
  source_title: string | null;
  source_linked_by: string | null;
};

/**
 * Refreshes linked items from Jira, each with the Jira account of whoever
 * linked it. Only items not checked in `olderThanMs`; optionally one
 * capsule's. Items whose linker disconnected keep their last details.
 */
export async function syncLinkedItems(opts: {
  capsuleId?: string;
  olderThanMs: number;
  limit?: number;
}) {
  if (!jiraConfigured()) return { checked: 0, updated: 0 };
  const admin = createAdminClient();
  if (!admin) return { checked: 0, updated: 0 };
  let q = admin
    .from("work_items")
    .select("id, org_id, title, source_key, source_title, source_linked_by")
    .eq("source", "jira")
    .not("source_linked_by", "is", null)
    .or(`synced_at.is.null,synced_at.lt.${new Date(Date.now() - opts.olderThanMs).toISOString()}`)
    .limit(opts.limit ?? 500);
  if (opts.capsuleId) q = q.eq("capsule_id", opts.capsuleId);
  const { data } = await q;
  const rows = (data ?? []) as LinkedRow[];
  const byLinker = new Map<string, LinkedRow[]>();
  for (const r of rows)
    byLinker.set(r.source_linked_by!, [...(byLinker.get(r.source_linked_by!) ?? []), r]);

  let updated = 0;
  for (const [userId, items] of byLinker) {
    const conn = await connectionOf(admin, userId);
    if (!conn || conn.status !== "active") continue;
    for (let i = 0; i < items.length; i += 50) {
      const chunk = items.slice(i, i + 50);
      let issues: JiraIssue[];
      try {
        issues = await searchJql(
          admin,
          conn,
          `key in (${chunk.map((c) => c.source_key).join(",")})`,
          50,
        );
      } catch {
        continue;
      }
      const byKey = new Map(issues.map((x) => [x.key, x]));
      const emails = await peopleByEmail(
        admin,
        chunk[0].org_id,
        issues.map((x) => x.assigneeEmail ?? ""),
      );
      for (const item of chunk) {
        const issue = byKey.get(item.source_key);
        const now = new Date().toISOString();
        if (!issue) {
          await admin.from("work_items").update({ synced_at: now }).eq("id", item.id);
          continue;
        }
        const { error } = await admin
          .from("work_items")
          .update({
            status: statusFromJira(issue.statusCategory, issue.statusName),
            source_status: issue.statusName.slice(0, 100),
            source_status_category: issue.statusCategory,
            assignee_id: issue.assigneeEmail ? (emails.get(issue.assigneeEmail) ?? null) : null,
            source_assignee: issue.assigneeName?.slice(0, 200) ?? null,
            source_url: issue.url,
            source_title: issue.title.slice(0, 500),
            // A rename in Capsule sticks; otherwise follow Jira's title.
            ...(item.title === item.source_title && { title: issue.title.slice(0, 500) }),
            synced_at: now,
          })
          .eq("id", item.id);
        if (!error) updated++;
      }
    }
  }
  return { checked: rows.length, updated };
}
