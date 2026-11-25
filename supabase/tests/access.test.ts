import { writeFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { as, attempt, pool, value, type Db, type Outcome, type Who } from "./db";
import {
  ATTACHMENT,
  CAPSULE,
  COMP,
  EVENT,
  FILE_PATH,
  fingerprint,
  INVITATION,
  LINK,
  ITEM,
  MENTION,
  NAMES,
  ORG,
  P,
  SHAPING,
  SPACE,
  TYPE,
} from "./fixtures";

/**
 * Access-rule tests: what each persona can and can't see or do.
 * Each case is one row in docs/access-rules.md (npm run test:db:report).
 */

type Expect = "allowed" | "blocked";
type Case = {
  who: Who;
  tries: string;
  expect: Expect;
  run: (db: Db) => Promise<Outcome>;
};
type Group = { title: string; cases: Case[] };

const read =
  (sql: string, params: unknown[] = []) =>
  (db: Db) =>
    attempt(db, sql, params);
const write = read;

// Shorthand for "this should be true", for cases that check a value.
const check = (ok: boolean, detail: string): Outcome => ({ allowed: ok, detail });

const seeEveryAcmeRow = (db: Db) =>
  attempt(
    db,
    `select 1 from public.orgs where id = $1
     union all select 1 from public.spaces where org_id = $1
     union all select 1 from public.capsules where org_id = $1
     union all select 1 from public.org_members where org_id = $1
     union all select 1 from public.events where org_id = $1
     union all select 1 from public.attachments where org_id = $1
     union all select 1 from public.component_types where org_id = $1
     union all select 1 from public.users where id = $2`,
    [ORG.acme, P.christina],
  );

/** Switches who is signed in, inside the same transaction (to set things up as someone else). */
const signIn = (db: Db, who: "christina" | "dana" | "jon" | "maya" | "bob") =>
  db.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: P[who], role: "authenticated", aud: "authenticated" }),
  ]);

/** Adds a collaborator to Dana's API work item, signed in as Dana (she owns Tech). */
async function addPiece(
  db: Db,
  user: string,
  piece: string,
  back: "christina" | "dana" | "jon" | "maya" | "bob",
  lead = false,
) {
  await signIn(db, "dana");
  const id = await value<string>(
    db,
    `insert into public.work_item_collaborators
       (org_id, capsule_id, work_item_id, user_id, piece, is_lead, created_by)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [ORG.acme, CAPSULE.en1, ITEM.techApi, user, piece, lead, P.dana],
  );
  await signIn(db, back);
  return id!;
}

const itemStatus = (db: Db) =>
  value<string>(
    db,
    `select status || ':' || done || ':' || status_manual || ':' || (done_at is not null)
     from public.work_items where id = $1`,
    [ITEM.techApi],
  );

const CLAUDE_APP = "00000000-0000-4000-8000-00000000c1a0";
const NAMELESS_APP = "00000000-0000-4000-8000-00000000c1a1";

/**
 * Signs in as someone through an AI app, the way Supabase's OAuth server
 * does: the same token as the app's, plus the app's `client_id`. Registers
 * the app (and the person's consent) first, as Supabase would.
 */
async function viaApp(
  db: Db,
  who: "christina" | "dana" | "jon" | "maya" | "bob" | "olga",
  app = CLAUDE_APP,
) {
  await db.query("reset role");
  await db.query(
    `insert into auth.oauth_clients (id, registration_type, redirect_uris, grant_types, client_name, client_type, token_endpoint_auth_method)
     values ($1, 'dynamic', 'https://claude.ai/api/mcp/auth_callback', 'authorization_code,refresh_token', $2, 'public', 'none')
     on conflict (id) do nothing`,
    [app, app === CLAUDE_APP ? "Claude" : null],
  );
  await db.query(
    `insert into auth.oauth_consents (id, user_id, client_id, scopes)
     values (gen_random_uuid(), $1, $2, 'email') on conflict (user_id, client_id) do nothing`,
    [P[who], app],
  );
  await db.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: P[who], role: "authenticated", aud: "authenticated", client_id: app }),
  ]);
  await db.query("set local role authenticated");
}

/** Where the newest activity entry on EN-1 came from: "source:app name". */
const lastSource = (db: Db) =>
  value<string>(
    db,
    `select kind || ':' || source || ':' || coalesce(agent_client, '-') from public.events
     where capsule_id = $1 order by created_at desc limit 1`,
    [CAPSULE.en1],
  );

const JIRA_ISSUE = (key = "ENG-142", status = "in_progress") =>
  JSON.stringify({
    key,
    id: "10042",
    title: "Ranking service",
    url: `https://acme.atlassian.net/browse/${key}`,
    status,
    status_name: status === "done" ? "Done" : "In Progress",
    status_category: status === "done" ? "done" : "indeterminate",
    assignee_name: "Someone in Jira",
  });

/** Links ENG-142 to EN-1's Operations as Jon (on the team), then signs back in as `back`. */
async function linkAsJon(db: Db, back: "christina" | "dana" | "jon" | "maya" | "bob" = "jon") {
  await signIn(db, "jon");
  const id = await value<string>(db, `select public.link_work_item($1, $2::jsonb)`, [
    COMP.en1Ops,
    JIRA_ISSUE(),
  ]);
  await signIn(db, back);
  return id!;
}

/** Stores a Jira connection for someone, as the server does after they connect. */
async function connectJira(db: Db, who: "christina" | "dana" | "jon") {
  await db.query("reset role");
  await db.query(
    `insert into public.integrations (org_id, user_id, tool, site_id, site_url, site_name, account_name, access_token, refresh_token)
     values ($1, $2, 'jira', 'cloud-1', 'https://acme.atlassian.net', 'Acme', 'Person', 'enc:access', 'enc:refresh')`,
    [ORG.acme, P[who]],
  );
  await db.query("set local role authenticated");
}

const groups: Group[] = [
  {
    title: "Seeing capsules",
    cases: [
      {
        who: "christina",
        tries: "see capsule EN-1 (she owns it)",
        expect: "allowed",
        run: read(`select 1 from public.capsules where id = $1`, [CAPSULE.en1]),
      },
      {
        who: "jon",
        tries: "see EN-1 and its components and work items",
        expect: "allowed",
        run: read(
          `select 1 from public.capsules c join public.components m on m.capsule_id = c.id
           join public.work_items w on w.component_id = m.id where c.id = $1`,
          [CAPSULE.en1],
        ),
      },
      {
        who: "bob",
        tries: "see EN-1, which he follows",
        expect: "allowed",
        run: read(`select 1 from public.capsules where id = $1`, [CAPSULE.en1]),
      },
      {
        who: "maya",
        tries: "see EN-1 (in V1 every capsule is visible to the whole org)",
        expect: "allowed",
        run: read(`select 1 from public.capsules where id = $1`, [CAPSULE.en1]),
      },
      {
        who: "alex",
        tries: "see EN-2, a capsule he isn't on",
        expect: "allowed",
        run: read(`select 1 from public.capsules where id = $1`, [CAPSULE.en2]),
      },
      {
        who: "christina",
        tries: "see the key EN-1",
        expect: "allowed",
        run: async (db) => {
          const key = await value<string>(
            db,
            `select public.capsule_key(c) from public.capsules c where id = $1`,
            [CAPSULE.en1],
          );
          return check(key === "EN-1", `key is ${key}`);
        },
      },
      {
        who: "olga",
        tries: "see anything at all in Acme (org, spaces, capsules, people, activity, files)",
        expect: "blocked",
        run: seeEveryAcmeRow,
      },
      {
        who: "christina",
        tries: "see Beta Corp's capsule, even as an org admin",
        expect: "blocked",
        run: read(`select 1 from public.capsules where id = $1`, [CAPSULE.be1]),
      },
      {
        who: "signed out",
        tries: "see any capsule",
        expect: "blocked",
        run: read(`select 1 from public.capsules`),
      },
      {
        who: "bob",
        tries: "see the people in his org",
        expect: "allowed",
        run: read(`select 1 from public.users where id = $1`, [P.dana]),
      },
      {
        who: "bob",
        tries: "see people in another org",
        expect: "blocked",
        run: read(`select 1 from public.users where id = $1`, [P.olga]),
      },
    ],
  },
  {
    title: "Editing a capsule",
    cases: [
      {
        who: "christina",
        tries: "rename EN-1 (capsule owner)",
        expect: "allowed",
        run: write(`update public.capsules set name = 'Leaderboard launch' where id = $1`, [
          CAPSULE.en1,
        ]),
      },
      {
        who: "christina",
        tries: "change EN-1's status and launch date",
        expect: "allowed",
        run: write(
          `update public.capsules set status = 'in_progress', launch_date = '2026-12-01' where id = $1`,
          [CAPSULE.en1],
        ),
      },
      {
        who: "dana",
        tries: "rename EN-1 (she only owns a component)",
        expect: "blocked",
        run: write(`update public.capsules set name = 'Mine now' where id = $1`, [CAPSULE.en1]),
      },
      {
        who: "alex",
        tries: "rename EN-1 (org admin, but not on the team)",
        expect: "blocked",
        run: write(`update public.capsules set name = 'Admin edit' where id = $1`, [CAPSULE.en1]),
      },
      {
        who: "bob",
        tries: "rename EN-1 (follower)",
        expect: "blocked",
        run: write(`update public.capsules set name = 'Follower edit' where id = $1`, [
          CAPSULE.en1,
        ]),
      },
      {
        who: "christina",
        tries: "change EN-1's number or move it to another org",
        expect: "blocked",
        run: write(`update public.capsules set number = 99 where id = $1`, [CAPSULE.en1]),
      },
      {
        who: "maya",
        tries: "create a capsule in Engineering",
        expect: "allowed",
        run: write(
          `insert into public.capsules (org_id, space_id, name, owner_id, created_by)
           values ($1, $2, 'Maya''s idea', $3, $3)`,
          [ORG.acme, SPACE.en, P.maya],
        ),
      },
      {
        who: "christina",
        tries: "create a capsule and get the next key in the space (EN-3)",
        expect: "allowed",
        run: async (db) => {
          const key = await value<string>(
            db,
            `with c as (
               insert into public.capsules (org_id, space_id, name, owner_id, created_by)
               values ($1, $2, 'Third capsule', $3, $3) returning *
             ) select public.capsule_key(c) from c`,
            [ORG.acme, SPACE.en, P.christina],
          );
          return check(key === "EN-3", `key is ${key}`);
        },
      },
      {
        who: "olga",
        tries: "create a capsule in Acme's Engineering space",
        expect: "blocked",
        run: write(
          `insert into public.capsules (org_id, space_id, name, owner_id, created_by)
           values ($1, $2, 'Sneaky', null, $3)`,
          [ORG.acme, SPACE.en, P.olga],
        ),
      },
      {
        who: "christina",
        tries: "make someone from another org the owner of EN-1",
        expect: "blocked",
        run: write(`update public.capsules set owner_id = $2 where id = $1`, [CAPSULE.en1, P.olga]),
      },
    ],
  },
  {
    title: "Components and collaborators",
    cases: [
      {
        who: "dana",
        tries: "change the status of Tech, the component she owns",
        expect: "allowed",
        run: write(`update public.components set status = 'in_review' where id = $1`, [
          COMP.en1Tech,
        ]),
      },
      {
        who: "dana",
        tries: "change the status of Operations, which she doesn't own",
        expect: "blocked",
        run: write(`update public.components set status = 'done' where id = $1`, [COMP.en1Ops]),
      },
      {
        who: "christina",
        tries: "give the unowned Operations component an owner (capsule owner)",
        expect: "allowed",
        run: write(`update public.components set owner_id = $2 where id = $1`, [
          COMP.en1Ops,
          P.jon,
        ]),
      },
      {
        who: "jon",
        tries: "change the due date on Tech",
        expect: "blocked",
        run: write(`update public.components set due_date = '2026-12-24' where id = $1`, [
          COMP.en1Tech,
        ]),
      },
      {
        who: "christina",
        tries: "add a Marketing component to EN-1",
        expect: "allowed",
        run: write(
          `insert into public.components (org_id, capsule_id, component_type_id) values ($1, $2, $3)`,
          [ORG.acme, CAPSULE.en1, TYPE.marketing],
        ),
      },
      {
        who: "dana",
        tries: "add a component to EN-1",
        expect: "blocked",
        run: write(
          `insert into public.components (org_id, capsule_id, component_type_id) values ($1, $2, $3)`,
          [ORG.acme, CAPSULE.en1, TYPE.marketing],
        ),
      },
      {
        who: "dana",
        tries: "remove a component from EN-1",
        expect: "blocked",
        run: write(`delete from public.components where id = $1`, [COMP.en1Sales]),
      },
      {
        who: "dana",
        tries: "add Maya as a collaborator on Tech",
        expect: "allowed",
        run: write(
          `insert into public.component_people (org_id, capsule_id, component_id, user_id)
           values ($1, $2, $3, $4)`,
          [ORG.acme, CAPSULE.en1, COMP.en1Tech, P.maya],
        ),
      },
      {
        who: "jon",
        tries: "add Maya as a collaborator on Tech",
        expect: "blocked",
        run: write(
          `insert into public.component_people (org_id, capsule_id, component_id, user_id)
           values ($1, $2, $3, $4)`,
          [ORG.acme, CAPSULE.en1, COMP.en1Tech, P.maya],
        ),
      },
    ],
  },
  {
    title: "Work items",
    cases: [
      {
        who: "jon",
        tries: "check off the work item assigned to him",
        expect: "allowed",
        run: write(`update public.work_items set done = true where id = $1`, [ITEM.opsRunbook]),
      },
      {
        who: "jon",
        tries: "check off an unassigned work item",
        expect: "blocked",
        run: write(`update public.work_items set done = true where id = $1`, [ITEM.opsTraining]),
      },
      {
        who: "dana",
        tries: "check off a work item in a component she doesn't own",
        expect: "blocked",
        run: write(`update public.work_items set done = true where id = $1`, [ITEM.opsRunbook]),
      },
      {
        who: "christina",
        tries: "check off any work item on her capsule",
        expect: "allowed",
        run: write(`update public.work_items set done = true where id = $1`, [ITEM.techApi]),
      },
      {
        who: "bob",
        tries: "check off a work item (follower)",
        expect: "blocked",
        run: write(`update public.work_items set done = true where id = $1`, [ITEM.opsRunbook]),
      },
      {
        who: "alex",
        tries: "check off a work item (org admin, not on the team)",
        expect: "blocked",
        run: write(`update public.work_items set done = true where id = $1`, [ITEM.opsRunbook]),
      },
      {
        who: "jon",
        tries: "add a work item to Operations, assigned to himself",
        expect: "allowed",
        run: write(
          `insert into public.work_items (org_id, capsule_id, component_id, title, assignee_id, created_by)
           values ($1, $2, $3, 'Draft the FAQ', $4, $4)`,
          [ORG.acme, CAPSULE.en1, COMP.en1Ops, P.jon],
        ),
      },
      {
        who: "jon",
        tries: "add a work item assigned to Dana",
        expect: "blocked",
        run: write(
          `insert into public.work_items (org_id, capsule_id, component_id, title, assignee_id, created_by)
           values ($1, $2, $3, 'Your problem now', $4, $5)`,
          [ORG.acme, CAPSULE.en1, COMP.en1Ops, P.dana, P.jon],
        ),
      },
      {
        who: "dana",
        tries: "assign Jon a Tech work item, which adds him to the Tech team",
        expect: "allowed",
        run: async (db) => {
          const ins = await attempt(
            db,
            `insert into public.work_items (org_id, capsule_id, component_id, title, assignee_id, created_by)
             values ($1, $2, $3, 'Load test the API', $4, $5)`,
            [ORG.acme, CAPSULE.en1, COMP.en1Tech, P.jon, P.dana],
          );
          if (!ins.allowed) return ins;
          const joined = await value<boolean>(
            db,
            `select exists (select 1 from public.component_people where component_id = $1 and user_id = $2)`,
            [COMP.en1Tech, P.jon],
          );
          return check(joined === true, joined ? "Jon joined Tech" : "Jon did not join Tech");
        },
      },
      {
        who: "christina",
        tries: "delete Jon's last Operations item, which takes him off that component",
        expect: "allowed",
        run: async (db) => {
          const del = await attempt(db, `delete from public.work_items where id = $1`, [
            ITEM.opsRunbook,
          ]);
          if (!del.allowed) return del;
          const still = await value<boolean>(
            db,
            `select exists (select 1 from public.component_people where component_id = $1 and user_id = $2)`,
            [COMP.en1Ops, P.jon],
          );
          return check(
            still === false,
            still ? "Jon is still on Operations" : "Jon left Operations",
          );
        },
      },
      {
        who: "bob",
        tries: "add a work item (follower)",
        expect: "blocked",
        run: write(
          `insert into public.work_items (org_id, capsule_id, component_id, title, created_by)
           values ($1, $2, $3, 'Follower item', $4)`,
          [ORG.acme, CAPSULE.en1, COMP.en1Ops, P.bob],
        ),
      },
      {
        who: "jon",
        tries: "take the unassigned work item for himself",
        expect: "allowed",
        run: write(`update public.work_items set assignee_id = $2 where id = $1`, [
          ITEM.opsTraining,
          P.jon,
        ]),
      },
      {
        who: "jon",
        tries: "hand his work item to Dana",
        expect: "blocked",
        run: write(`update public.work_items set assignee_id = $2 where id = $1`, [
          ITEM.opsRunbook,
          P.dana,
        ]),
      },
      {
        who: "jon",
        tries: "rename a work item he neither created nor is assigned",
        expect: "blocked",
        run: write(`update public.work_items set title = 'Renamed' where id = $1`, [ITEM.techApi]),
      },
      {
        who: "jon",
        tries: "delete a work item Christina created",
        expect: "blocked",
        run: write(`delete from public.work_items where id = $1`, [ITEM.opsTraining]),
      },
      {
        who: "jon",
        tries: "mark a new work item as synced from Jira (Later, not V1)",
        expect: "blocked",
        run: write(
          `insert into public.work_items (org_id, capsule_id, component_id, title, created_by, source)
           values ($1, $2, $3, 'Fake Jira item', $4, 'jira')`,
          [ORG.acme, CAPSULE.en1, COMP.en1Ops, P.jon],
        ),
      },
    ],
  },
  {
    title: "Comments and @mentions",
    cases: [
      {
        who: "jon",
        tries: "comment on EN-1 (team member)",
        expect: "allowed",
        run: write(
          `insert into public.events (org_id, capsule_id, actor_user_id, kind, data)
           values ($1, $2, $3, 'comment', '{"body":"Runbook draft is up"}')`,
          [ORG.acme, CAPSULE.en1, P.jon],
        ),
      },
      {
        who: "dana",
        tries: "reply to Christina's comment",
        expect: "allowed",
        run: write(
          `insert into public.events (org_id, capsule_id, actor_user_id, kind, data, parent_event_id)
           values ($1, $2, $3, 'comment', '{"body":"Yes, Dec 1"}', $4)`,
          [ORG.acme, CAPSULE.en1, P.dana, EVENT.en1Comment],
        ),
      },
      {
        who: "bob",
        tries: "comment on EN-1 (followers are read-only)",
        expect: "blocked",
        run: write(
          `insert into public.events (org_id, capsule_id, actor_user_id, kind, data)
           values ($1, $2, $3, 'comment', '{"body":"Looks great"}')`,
          [ORG.acme, CAPSULE.en1, P.bob],
        ),
      },
      {
        who: "alex",
        tries: "comment on EN-1 (org admin, not on the team)",
        expect: "blocked",
        run: write(
          `insert into public.events (org_id, capsule_id, actor_user_id, kind, data)
           values ($1, $2, $3, 'comment', '{"body":"Admin note"}')`,
          [ORG.acme, CAPSULE.en1, P.alex],
        ),
      },
      {
        who: "bob",
        tries: "read EN-1's activity and comments",
        expect: "allowed",
        run: read(`select 1 from public.events where capsule_id = $1`, [CAPSULE.en1]),
      },
      {
        who: "jon",
        tries: "post a comment as Dana",
        expect: "blocked",
        run: write(
          `insert into public.events (org_id, capsule_id, actor_user_id, kind, data)
           values ($1, $2, $3, 'comment', '{"body":"I agree (signed, Dana)"}')`,
          [ORG.acme, CAPSULE.en1, P.dana],
        ),
      },
      {
        who: "jon",
        tries: "write a fake activity entry (not a comment)",
        expect: "blocked",
        run: write(
          `insert into public.events (org_id, capsule_id, actor_user_id, kind, data)
           values ($1, $2, $3, 'capsule_status_changed', '{"to":"done"}')`,
          [ORG.acme, CAPSULE.en1, P.jon],
        ),
      },
      {
        who: "christina",
        tries: "edit her own past comment in the activity log",
        expect: "blocked",
        run: write(`update public.events set data = '{"body":"edited"}' where id = $1`, [
          EVENT.en1Comment,
        ]),
      },
      {
        who: "christina",
        tries: "delete an entry from the activity log",
        expect: "blocked",
        run: write(`delete from public.events where id = $1`, [EVENT.en1Comment]),
      },
      {
        who: "dana",
        tries: "reply on EN-2 to a comment that's on EN-1",
        expect: "blocked",
        run: write(
          `insert into public.events (org_id, capsule_id, actor_user_id, kind, data, parent_event_id)
           values ($1, $2, $3, 'comment', '{"body":"wrong place"}', $4)`,
          [ORG.acme, CAPSULE.en2, P.dana, EVENT.en1Comment],
        ),
      },
      {
        who: "jon",
        tries: "@mention Dana (on the team) in his own comment",
        expect: "allowed",
        run: async (db) => {
          const ev = await value<string>(
            db,
            `insert into public.events (org_id, capsule_id, actor_user_id, kind, data)
             values ($1, $2, $3, 'comment', '{"body":"@Dana take a look"}') returning id`,
            [ORG.acme, CAPSULE.en1, P.jon],
          );
          return attempt(
            db,
            `insert into public.mentions (org_id, event_id, user_id) values ($1, $2, $3)`,
            [ORG.acme, ev, P.dana],
          );
        },
      },
      {
        who: "jon",
        tries: "@mention Bob, who only follows (team members only)",
        expect: "blocked",
        run: async (db) => {
          const ev = await value<string>(
            db,
            `insert into public.events (org_id, capsule_id, actor_user_id, kind, data)
             values ($1, $2, $3, 'comment', '{"body":"@Bob fyi"}') returning id`,
            [ORG.acme, CAPSULE.en1, P.jon],
          );
          return attempt(
            db,
            `insert into public.mentions (org_id, event_id, user_id) values ($1, $2, $3)`,
            [ORG.acme, ev, P.bob],
          );
        },
      },
      {
        who: "jon",
        tries: "add an @mention to Christina's comment",
        expect: "blocked",
        run: write(`insert into public.mentions (org_id, event_id, user_id) values ($1, $2, $3)`, [
          ORG.acme,
          EVENT.en1Comment,
          P.jon,
        ]),
      },
      {
        who: "dana",
        tries: "see and mark read the mention addressed to her",
        expect: "allowed",
        run: write(`update public.mentions set read_at = now() where id = $1`, [MENTION.danaInEn1]),
      },
      {
        who: "bob",
        tries: "see a mention addressed to Dana",
        expect: "blocked",
        run: read(`select 1 from public.mentions where id = $1`, [MENTION.danaInEn1]),
      },
    ],
  },
  {
    title: "Following",
    cases: [
      {
        who: "bob",
        tries: "follow EN-2",
        expect: "allowed",
        run: write(
          `insert into public.followers (org_id, capsule_id, user_id) values ($1, $2, $3)`,
          [ORG.acme, CAPSULE.en2, P.bob],
        ),
      },
      {
        who: "bob",
        tries: "unfollow EN-1",
        expect: "allowed",
        run: write(`delete from public.followers where capsule_id = $1 and user_id = $2`, [
          CAPSULE.en1,
          P.bob,
        ]),
      },
      {
        who: "bob",
        tries: "make Maya follow EN-1",
        expect: "blocked",
        run: write(
          `insert into public.followers (org_id, capsule_id, user_id) values ($1, $2, $3)`,
          [ORG.acme, CAPSULE.en1, P.maya],
        ),
      },
      {
        who: "olga",
        tries: "follow an Acme capsule",
        expect: "blocked",
        run: write(
          `insert into public.followers (org_id, capsule_id, user_id) values ($1, $2, $3)`,
          [ORG.acme, CAPSULE.en1, P.olga],
        ),
      },
      {
        who: "maya",
        tries: "follow EN-1 (in the org, not involved)",
        expect: "allowed",
        run: write(
          `insert into public.followers (org_id, capsule_id, user_id) values ($1, $2, $3)`,
          [ORG.acme, CAPSULE.en1, P.maya],
        ),
      },
      {
        who: "maya",
        tries: "see who follows EN-1 (the followers list)",
        expect: "allowed",
        run: read(`select 1 from public.followers where capsule_id = $1 and user_id = $2`, [
          CAPSULE.en1,
          P.bob,
        ]),
      },
      {
        who: "dana",
        tries: "unfollow EN-1 on Bob's behalf",
        expect: "blocked",
        run: write(`delete from public.followers where capsule_id = $1 and user_id = $2`, [
          CAPSULE.en1,
          P.bob,
        ]),
      },
      {
        who: "olga",
        tries: "see who follows an Acme capsule",
        expect: "blocked",
        run: read(`select 1 from public.followers where capsule_id = $1`, [CAPSULE.en1]),
      },
      {
        who: "bob",
        tries: "rename EN-1 while following it",
        expect: "blocked",
        run: write(`update public.capsules set name = 'Bob was here' where id = $1`, [CAPSULE.en1]),
      },
    ],
  },
  {
    title: "Home: Needs your attention",
    cases: [
      {
        who: "jon",
        tries: "see his own list: the work item assigned to him",
        expect: "allowed",
        run: async (db) => {
          const rows = await value<string>(
            db,
            `select string_agg(kind || ':' || title, ',' order by kind, title) from public.needs_attention()`,
          );
          return check(rows === "item:Write the support runbook", String(rows));
        },
      },
      {
        who: "dana",
        tries: "see her list: her item, her components and the @mention of her",
        expect: "allowed",
        run: async (db) => {
          const rows = await value<string>(
            db,
            `select string_agg(kind || ':' || capsule_key || ':' || title, ',' order by kind, capsule_key, title)
             from public.needs_attention()`,
          );
          return check(
            rows ===
              "component:EN-1:Tech,component:EN-2:Tech,item:EN-1:Build the leaderboard API,mention:EN-1:Partner leaderboard launch",
            String(rows),
          );
        },
      },
      {
        who: "christina",
        tries: "see Operations (no owner, on her capsule) but not Sales, which she removed",
        expect: "allowed",
        run: async (db) => {
          const rows = await value<string>(
            db,
            `select string_agg(kind || ':' || title, ',' order by kind, title) from public.needs_attention()`,
          );
          return check(rows === "no_owner:Operations", String(rows));
        },
      },
      {
        who: "bob",
        tries: "have nothing in his list (he only follows)",
        expect: "allowed",
        run: async (db) => {
          const n = await value<number>(db, `select count(*)::int from public.needs_attention()`);
          return check(n === 0, `${n} rows`);
        },
      },
      {
        who: "dana",
        tries: "answer her @mention by commenting, which clears it from her list",
        expect: "allowed",
        run: async (db) => {
          await value(db, `select public.post_comment($1, 'Yes, Dec 1 works.', '{}')`, [
            CAPSULE.en1,
          ]);
          const n = await value<number>(
            db,
            `select count(*)::int from public.needs_attention() where kind = 'mention'`,
          );
          return check(n === 0, `${n} mentions left`);
        },
      },
      {
        who: "dana",
        tries:
          "remove her work item from the list, then see it come back when it's handed to her again",
        expect: "allowed",
        run: async (db) => {
          const since = await value<string>(
            db,
            `select since from public.needs_attention() where target_id = $1`,
            [ITEM.techApi],
          );
          await attempt(
            db,
            `insert into public.dismissals (org_id, user_id, capsule_id, kind, target_id, since)
             values ($1, $2, $3, 'item', $4, $5)`,
            [ORG.acme, P.dana, CAPSULE.en1, ITEM.techApi, since],
          );
          const hidden = await value<number>(
            db,
            `select count(*)::int from public.needs_attention() where target_id = $1`,
            [ITEM.techApi],
          );
          await attempt(db, `update public.work_items set assignee_id = null where id = $1`, [
            ITEM.techApi,
          ]);
          await attempt(db, `update public.work_items set assignee_id = $2 where id = $1`, [
            ITEM.techApi,
            P.dana,
          ]);
          const back = await value<number>(
            db,
            `select count(*)::int from public.needs_attention() where target_id = $1`,
            [ITEM.techApi],
          );
          return check(hidden === 0 && back === 1, `hidden ${hidden}; back ${back}`);
        },
      },
      {
        who: "christina",
        tries: "undo her removal of Sales",
        expect: "allowed",
        run: write(`delete from public.dismissals where user_id = $1 and target_id = $2`, [
          P.christina,
          COMP.en1Sales,
        ]),
      },
      {
        who: "dana",
        tries: "see what Christina removed from her list",
        expect: "blocked",
        run: read(`select 1 from public.dismissals where user_id = $1`, [P.christina]),
      },
      {
        who: "dana",
        tries: "undo Christina's removal for her",
        expect: "blocked",
        run: write(`delete from public.dismissals where user_id = $1`, [P.christina]),
      },
      {
        who: "dana",
        tries: "remove a row from Christina's list",
        expect: "blocked",
        run: write(
          `insert into public.dismissals (org_id, user_id, capsule_id, kind, target_id, since)
           values ($1, $2, $3, 'no_owner', $4, now())`,
          [ORG.acme, P.christina, CAPSULE.en1, COMP.en1Ops],
        ),
      },
      {
        who: "olga",
        tries: "file a removal against an Acme capsule",
        expect: "blocked",
        run: write(
          `insert into public.dismissals (org_id, user_id, capsule_id, kind, target_id, since)
           values ($1, $2, $3, 'item', $4, now())`,
          [ORG.acme, P.olga, CAPSULE.en1, ITEM.techApi],
        ),
      },
      {
        who: "jon",
        tries: "post a comment that claims to come from an AI agent (MCP)",
        expect: "blocked",
        // The comment saves, but as his own from the app: the claim doesn't stick.
        run: async (db) => {
          await db.query(
            `insert into public.events (org_id, capsule_id, actor_user_id, kind, data, source, agent_client)
             values ($1, $2, $3, 'comment', '{"body":"hi"}', 'mcp', 'Claude')`,
            [ORG.acme, CAPSULE.en1, P.jon],
          );
          const src = await lastSource(db);
          return check(src !== "comment:app:-", `stored as ${src}`);
        },
      },
    ],
  },
  {
    title: "Home: Your capsules and Capsules you follow",
    cases: [
      {
        who: "bob",
        tries: "see who owns each component of EN-1, which he follows (warnings and team faces)",
        expect: "allowed",
        run: async (db) => {
          const owners = await value<string>(
            db,
            `select string_agg(coalesce(owner_id::text, 'none'), ',' order by position, id)
             from public.components where capsule_id = $1`,
            [CAPSULE.en1],
          );
          return check(
            (owners ?? "").includes("none") && (owners ?? "").includes(P.dana),
            `${owners}`,
          );
        },
      },
      {
        who: "bob",
        tries: "see the people on EN-1's components",
        expect: "allowed",
        run: async (db) => {
          await signIn(db, "dana");
          await db.query(
            `insert into public.component_people (org_id, capsule_id, component_id, user_id)
             values ($1, $2, $3, $4) on conflict do nothing`,
            [ORG.acme, CAPSULE.en1, COMP.en1Tech, P.jon],
          );
          await signIn(db, "bob");
          return read(
            `select 1 from public.component_people where capsule_id = $1 and user_id = $2`,
            [CAPSULE.en1, P.jon],
          )(db);
        },
      },
      {
        who: "olga",
        tries: "see Acme's components, the people on them, or who follows what",
        expect: "blocked",
        run: read(
          `select 1 from public.components where org_id = $1
           union all select 1 from public.component_people where org_id = $1
           union all select 1 from public.followers where org_id = $1`,
          [ORG.acme],
        ),
      },
    ],
  },
  {
    title: "AI shaping requests",
    cases: [
      {
        who: "jon",
        tries: "start a shaping request",
        expect: "allowed",
        run: async (db) => {
          const id = await value<string>(db, `select public.start_shaping()`);
          return check(Boolean(id), String(id));
        },
      },
      {
        who: "jon",
        tries: "record what happened to his own request (edited, then created EN-1)",
        expect: "allowed",
        run: write(
          `update public.shaping_requests set outcome = 'edited', capsule_id = $2 where id = $1`,
          [SHAPING.jon, CAPSULE.en1],
        ),
      },
      {
        who: "dana",
        tries: "see Jon's shaping request",
        expect: "blocked",
        run: read(`select 1 from public.shaping_requests where id = $1`, [SHAPING.jon]),
      },
      {
        who: "dana",
        tries: "change Jon's shaping request",
        expect: "blocked",
        run: write(`update public.shaping_requests set outcome = 'discarded' where id = $1`, [
          SHAPING.jon,
        ]),
      },
      {
        who: "jon",
        tries: "move his request to another person",
        expect: "blocked",
        run: write(`update public.shaping_requests set user_id = $2 where id = $1`, [
          SHAPING.jon,
          P.dana,
        ]),
      },
      {
        who: "jon",
        tries: "add a request directly, around the daily cap",
        expect: "blocked",
        run: write(`insert into public.shaping_requests (org_id, user_id) values ($1, $2)`, [
          ORG.acme,
          P.jon,
        ]),
      },
      {
        who: "sam",
        tries: "start a shaping request without an org",
        expect: "blocked",
        run: write(`select public.start_shaping()`),
      },
      {
        who: "christina",
        tries: "shape more than 30 capsules in a day for Acme (the 31st is refused)",
        expect: "allowed",
        run: async (db) => {
          let started = 0;
          let refused = "";
          for (let i = 0; i < 40 && !refused; i++) {
            const r = await attempt(db, `select public.start_shaping()`);
            if (r.allowed) started++;
            else refused = r.detail;
          }
          // Jon's request from earlier today counts too, so Christina gets 29.
          return check(
            refused.includes("Daily shaping limit") && started === 29,
            `started ${started}; refused: ${refused}`,
          );
        },
      },
    ],
  },
  {
    title: "Spaces",
    cases: [
      {
        who: "maya",
        tries: "create a public space (and join it as its admin)",
        expect: "allowed",
        run: async (db) => {
          const sid = await value<string>(
            db,
            `insert into public.spaces (org_id, name, key_prefix, created_by)
             values ($1, 'Customer Success', 'CX', $2) returning id`,
            [ORG.acme, P.maya],
          );
          const role = await value<string>(
            db,
            `select role from public.space_members where space_id = $1 and user_id = $2`,
            [sid, P.maya],
          );
          return check(role === "admin", `Maya's role: ${role}`);
        },
      },
      {
        who: "maya",
        tries: "create a private space (Later, not V1)",
        expect: "blocked",
        run: write(
          `insert into public.spaces (org_id, name, key_prefix, created_by, is_private)
           values ($1, 'Secret', 'SC', $2, true)`,
          [ORG.acme, P.maya],
        ),
      },
      {
        who: "maya",
        tries: "create a space with a key prefix already in use (EN)",
        expect: "blocked",
        run: write(
          `insert into public.spaces (org_id, name, key_prefix, created_by) values ($1, 'Eng 2', 'EN', $2)`,
          [ORG.acme, P.maya],
        ),
      },
      {
        who: "bob",
        tries: "join Partner Programs",
        expect: "allowed",
        run: write(
          `insert into public.space_members (org_id, space_id, user_id) values ($1, $2, $3)`,
          [ORG.acme, SPACE.pp, P.bob],
        ),
      },
      {
        who: "bob",
        tries: "leave Engineering",
        expect: "allowed",
        run: write(`delete from public.space_members where space_id = $1 and user_id = $2`, [
          SPACE.en,
          P.bob,
        ]),
      },
      {
        who: "bob",
        tries: "add Maya to Engineering",
        expect: "blocked",
        run: write(
          `insert into public.space_members (org_id, space_id, user_id) values ($1, $2, $3)`,
          [ORG.acme, SPACE.en, P.maya],
        ),
      },
      {
        who: "christina",
        tries: "rename Engineering (she created it)",
        expect: "allowed",
        run: write(`update public.spaces set name = 'Engineering & Data' where id = $1`, [
          SPACE.en,
        ]),
      },
      {
        who: "alex",
        tries: "rename Partner Programs (org admin)",
        expect: "allowed",
        run: write(`update public.spaces set name = 'Partners' where id = $1`, [SPACE.pp]),
      },
      {
        who: "dana",
        tries: "rename Engineering (she didn't create it)",
        expect: "blocked",
        run: write(`update public.spaces set name = 'Dana''s space' where id = $1`, [SPACE.en]),
      },
      {
        who: "christina",
        tries: "change Engineering's description (she created it)",
        expect: "allowed",
        run: write(
          `update public.spaces set description = 'Product and platform work' where id = $1`,
          [SPACE.en],
        ),
      },
      {
        who: "bob",
        tries: "change Engineering's description",
        expect: "blocked",
        run: write(`update public.spaces set description = 'Bob was here' where id = $1`, [
          SPACE.en,
        ]),
      },
      {
        who: "christina",
        tries: "leave Engineering, then undo, keeping her manager role",
        expect: "allowed",
        run: async (db) => {
          await attempt(
            db,
            `delete from public.space_members where space_id = $1 and user_id = $2`,
            [SPACE.en, P.christina],
          );
          const back = await attempt(
            db,
            `insert into public.space_members (org_id, space_id, user_id, role) values ($1, $2, $3, 'admin')`,
            [ORG.acme, SPACE.en, P.christina],
          );
          const role = await value<string>(
            db,
            `select role from public.space_members where space_id = $1 and user_id = $2`,
            [SPACE.en, P.christina],
          );
          return check(back.allowed && role === "admin", `${back.detail}; role ${role}`);
        },
      },
      {
        who: "bob",
        tries: "join a space as its manager",
        expect: "blocked",
        run: write(
          `insert into public.space_members (org_id, space_id, user_id, role) values ($1, $2, $3, 'admin')`,
          [ORG.acme, SPACE.pp, P.bob],
        ),
      },
      {
        who: "maya",
        tries: "open a space she hasn't joined and see its capsules",
        expect: "allowed",
        run: read(
          `select 1 from public.spaces s join public.capsules c on c.space_id = s.id where s.id = $1`,
          [SPACE.en],
        ),
      },
      {
        who: "christina",
        tries: "change Engineering's key prefix (would break capsule keys)",
        expect: "blocked",
        run: write(`update public.spaces set key_prefix = 'ENG' where id = $1`, [SPACE.en]),
      },
    ],
  },
  {
    title: "Org, people and Org components",
    cases: [
      {
        who: "bob",
        tries: "make himself an org admin",
        expect: "blocked",
        run: write(
          `update public.org_members set role = 'admin' where org_id = $1 and user_id = $2`,
          [ORG.acme, P.bob],
        ),
      },
      {
        who: "christina",
        tries: "make Bob an org admin",
        expect: "allowed",
        run: write(
          `update public.org_members set role = 'admin' where org_id = $1 and user_id = $2`,
          [ORG.acme, P.bob],
        ),
      },
      {
        who: "bob",
        tries: "set the areas he usually works in",
        expect: "allowed",
        run: write(
          `update public.org_members set usual_component_type_ids = array[$3]::uuid[]
           where org_id = $1 and user_id = $2`,
          [ORG.acme, P.bob, TYPE.ops],
        ),
      },
      {
        who: "bob",
        tries: "add an org component",
        expect: "blocked",
        run: write(
          `insert into public.component_types (org_id, name, color) values ($1, 'Legal', 'gray')`,
          [ORG.acme],
        ),
      },
      {
        who: "christina",
        tries: "add an org component (org admin)",
        expect: "allowed",
        run: write(
          `insert into public.component_types (org_id, name, color) values ($1, 'Legal', 'gray')`,
          [ORG.acme],
        ),
      },
      {
        who: "christina",
        tries: "rename Tech and change its color",
        expect: "allowed",
        run: write(
          `update public.component_types set name = 'Engineering', color = 'purple' where id = $1`,
          [TYPE.tech],
        ),
      },
      {
        who: "bob",
        tries: "change his own name",
        expect: "allowed",
        run: write(`update public.users set name = 'Bobby' where id = $1`, [P.bob]),
      },
      {
        who: "bob",
        tries: "change Dana's name",
        expect: "blocked",
        run: write(`update public.users set name = 'Not Dana' where id = $1`, [P.dana]),
      },
      {
        who: "bob",
        tries: "change his own sign-in email directly",
        expect: "blocked",
        run: write(`update public.users set email = 'bob@evil.test' where id = $1`, [P.bob]),
      },
      {
        who: "bob",
        tries: "add someone to the org",
        expect: "blocked",
        run: write(`insert into public.org_members (org_id, user_id) values ($1, $2)`, [
          ORG.acme,
          P.olga,
        ]),
      },
    ],
  },
  {
    title: "Attachments and files",
    cases: [
      {
        who: "jon",
        tries: "add a link to EN-1 (team member)",
        expect: "allowed",
        run: write(
          `insert into public.attachments (org_id, capsule_id, kind, name, url, link_type, added_by)
           values ($1, $2, 'link', 'Runbook', 'https://docs.google.com/document/d/x', 'google_docs', $3)`,
          [ORG.acme, CAPSULE.en1, P.jon],
        ),
      },
      {
        who: "jon",
        tries: "add the same link twice",
        expect: "blocked",
        run: write(
          `insert into public.attachments (org_id, capsule_id, kind, name, url, link_type, added_by)
           values ($1, $2, 'link', 'Designs again', 'https://www.figma.com/file/abc/leaderboard', 'figma', $3)`,
          [ORG.acme, CAPSULE.en1, P.jon],
        ),
      },
      {
        who: "jon",
        tries: "record a file bigger than 25 MB",
        expect: "blocked",
        run: write(
          `insert into public.attachments (org_id, capsule_id, kind, name, storage_path, size_bytes, added_by)
           values ($1, $2, 'file', 'huge.mov', 'x/y/huge.mov', 30000000, $3)`,
          [ORG.acme, CAPSULE.en1, P.jon],
        ),
      },
      {
        who: "bob",
        tries: "see EN-1's attachments (read-only)",
        expect: "allowed",
        run: read(`select 1 from public.attachments where capsule_id = $1`, [CAPSULE.en1]),
      },
      {
        who: "bob",
        tries: "add a link (follower)",
        expect: "blocked",
        run: write(
          `insert into public.attachments (org_id, capsule_id, kind, name, url, link_type, added_by)
           values ($1, $2, 'link', 'Bob link', 'https://example.com', 'link', $3)`,
          [ORG.acme, CAPSULE.en1, P.bob],
        ),
      },
      {
        who: "dana",
        tries: "remove the link she added",
        expect: "allowed",
        run: write(`update public.attachments set removed_at = now() where id = $1`, [
          ATTACHMENT.en1Figma,
        ]),
      },
      {
        who: "christina",
        tries: "remove Dana's link (capsule owner)",
        expect: "allowed",
        run: write(`update public.attachments set removed_at = now() where id = $1`, [
          ATTACHMENT.en1Figma,
        ]),
      },
      {
        who: "jon",
        tries: "remove Dana's link",
        expect: "blocked",
        run: write(`update public.attachments set removed_at = now() where id = $1`, [
          ATTACHMENT.en1Figma,
        ]),
      },
      {
        who: "jon",
        tries: "upload a file to EN-1",
        expect: "allowed",
        run: write(`insert into storage.objects (bucket_id, name) values ('attachments', $1)`, [
          `${CAPSULE.en1}/new-file/notes.pdf`,
        ]),
      },
      {
        who: "bob",
        tries: "upload a file to EN-1 (follower)",
        expect: "blocked",
        run: write(`insert into storage.objects (bucket_id, name) values ('attachments', $1)`, [
          `${CAPSULE.en1}/bob/notes.pdf`,
        ]),
      },
      {
        who: "bob",
        tries: "open a file attached to EN-1",
        expect: "allowed",
        run: read(`select 1 from storage.objects where name = $1`, [FILE_PATH.en1]),
      },
      {
        who: "olga",
        tries: "open a file attached to an Acme capsule",
        expect: "blocked",
        run: read(`select 1 from storage.objects where name = $1`, [FILE_PATH.en1]),
      },
      {
        who: "christina",
        tries: "open Beta Corp's file",
        expect: "blocked",
        run: read(`select 1 from storage.objects where name = $1`, [FILE_PATH.be1]),
      },
      {
        who: "jon",
        tries: "upload a file outside any capsule folder",
        expect: "blocked",
        run: write(
          `insert into storage.objects (bucket_id, name) values ('attachments', 'loose/notes.pdf')`,
        ),
      },
    ],
  },
  {
    title: "Attachments in Activity, and link and file checks",
    cases: [
      {
        who: "jon",
        tries: "attach a link, which logs “attached” under his name",
        expect: "allowed",
        run: async (db) => {
          await attempt(
            db,
            `insert into public.attachments (org_id, capsule_id, kind, name, url, link_type, added_by)
             values ($1, $2, 'link', 'Runbook', 'https://docs.google.com/document/d/runbook', 'google_docs', $3)`,
            [ORG.acme, CAPSULE.en1, P.jon],
          );
          const entry = await value<string>(
            db,
            `select actor_user_id || ' ' || kind || ' ' || (data ->> 'name') from public.events
             where capsule_id = $1 and kind like 'attachment%'`,
            [CAPSULE.en1],
          );
          return check(entry === `${P.jon} attachment_added Runbook`, String(entry));
        },
      },
      {
        who: "dana",
        tries: "remove her link and put it back, which logs both",
        expect: "allowed",
        run: async (db) => {
          await attempt(db, `update public.attachments set removed_at = now() where id = $1`, [
            ATTACHMENT.en1Figma,
          ]);
          await attempt(db, `update public.attachments set removed_at = null where id = $1`, [
            ATTACHMENT.en1Figma,
          ]);
          const entries = await value<string>(
            db,
            `select string_agg(kind, ',' order by created_at) from public.events
             where capsule_id = $1 and kind like 'attachment%'`,
            [CAPSULE.en1],
          );
          return check(entries === "attachment_removed,attachment_restored", String(entries));
        },
      },
      {
        who: "jon",
        tries: "attach a “javascript:” link",
        expect: "blocked",
        run: write(
          `insert into public.attachments (org_id, capsule_id, kind, name, url, link_type, added_by)
           values ($1, $2, 'link', 'Click me', 'javascript:alert(1)', 'link', $3)`,
          [ORG.acme, CAPSULE.en1, P.jon],
        ),
      },
      {
        who: "jon",
        tries: "record a file on EN-1 that's stored in another capsule's folder",
        expect: "blocked",
        run: write(
          `insert into public.attachments (org_id, capsule_id, kind, name, storage_path, size_bytes, added_by)
           values ($1, $2, 'file', 'Plan.pdf', $3, 1000, $4)`,
          [ORG.acme, CAPSULE.en1, FILE_PATH.be1, P.jon],
        ),
      },
      {
        who: "jon",
        tries: "record a file on EN-1 stored in EN-1's own folder",
        expect: "allowed",
        run: write(
          `insert into public.attachments (org_id, capsule_id, kind, name, storage_path, size_bytes, added_by)
           values ($1, $2, 'file', 'Plan.pdf', $3, 1000, $4)`,
          [ORG.acme, CAPSULE.en1, `${CAPSULE.en1}/x/plan.pdf`, P.jon],
        ),
      },
    ],
  },
  {
    title: "Email notification setting",
    cases: [
      {
        who: "bob",
        tries: "turn off his own notification emails",
        expect: "allowed",
        run: write(`update public.users set email_notifications = false where id = $1`, [P.bob]),
      },
      {
        who: "christina",
        tries: "turn off Bob's notification emails (even as org admin)",
        expect: "blocked",
        run: write(`update public.users set email_notifications = false where id = $1`, [P.bob]),
      },
    ],
  },
  {
    title: "Setting up an org and invitations",
    cases: [
      {
        who: "nina",
        tries: "create an org (on the approved list), becoming its admin with 4 default components",
        expect: "allowed",
        run: async (db) => {
          const org = await value<string>(db, `select public.create_org('NewCo', 'Nina Park')`);
          const role = await value<string>(
            db,
            `select role from public.org_members where org_id = $1 and user_id = $2`,
            [org, P.nina],
          );
          const comps = await value<string>(
            db,
            `select string_agg(name, ', ' order by position) from public.component_types where org_id = $1`,
            [org],
          );
          const name = await value<string>(db, `select name from public.users where id = $1`, [
            P.nina,
          ]);
          return check(
            role === "admin" &&
              comps === "Tech, Operations, Sales, Marketing" &&
              name === "Nina Park",
            `role ${role}; components ${comps}; name ${name}`,
          );
        },
      },
      {
        who: "sam",
        tries: "create an org without being approved",
        expect: "blocked",
        run: write(`select public.create_org('Sneaky Inc', 'Sam')`),
      },
      {
        who: "christina",
        tries: "create a second org while already in one",
        expect: "blocked",
        run: write(`select public.create_org('Side project', 'Christina')`),
      },
      {
        who: "sam",
        tries: "be told Capsule is invite-only",
        expect: "allowed",
        run: async (db) => {
          const s = await value<string>(db, `select public.signup_status()`);
          return check(s === "not_approved", `status ${s}`);
        },
      },
      {
        who: "ivy",
        tries: "be recognized as invited, and see her own invitation",
        expect: "allowed",
        run: async (db) => {
          const s = await value<string>(db, `select public.signup_status()`);
          const n = await value<number>(db, `select count(*)::int from public.invitations`);
          return check(s === "invited" && n === 1, `status ${s}; sees ${n} invitation(s)`);
        },
      },
      {
        who: "ivy",
        tries: "add herself to Acme without accepting an invitation",
        expect: "blocked",
        run: write(`insert into public.org_members (org_id, user_id) values ($1, $2)`, [
          ORG.acme,
          P.ivy,
        ]),
      },
      {
        who: "sam",
        tries: "read the approved sign-up list",
        expect: "blocked",
        run: read(`select 1 from public.signup_approvals`),
      },
      {
        who: "christina",
        tries: "read the approved sign-up list through the app (dashboard only)",
        expect: "blocked",
        run: read(`select 1 from public.signup_approvals`),
      },
      {
        who: "christina",
        tries: "invite a teammate (org admin)",
        expect: "allowed",
        run: write(
          `insert into public.invitations (org_id, email, invited_by) values ($1, 'new@acme.test', $2)`,
          [ORG.acme, P.christina],
        ),
      },
      {
        who: "bob",
        tries: "invite someone (not an admin)",
        expect: "blocked",
        run: write(
          `insert into public.invitations (org_id, email, invited_by) values ($1, 'friend@acme.test', $2)`,
          [ORG.acme, P.bob],
        ),
      },
      {
        who: "christina",
        tries: "invite the same person twice",
        expect: "blocked",
        run: write(
          `insert into public.invitations (org_id, email, invited_by) values ($1, 'ivy@acme.test', $2)`,
          [ORG.acme, P.christina],
        ),
      },
      {
        who: "christina",
        tries: "remove an invitation that hasn't been sent",
        expect: "allowed",
        run: write(`delete from public.invitations where id = $1`, [INVITATION.bobDraft]),
      },
      {
        who: "bob",
        tries: "see who has been invited to his org",
        expect: "blocked",
        run: read(`select 1 from public.invitations where id = $1`, [INVITATION.ivyToAcme]),
      },
      {
        who: "olga",
        tries: "see another org's invitations",
        expect: "blocked",
        run: read(`select 1 from public.invitations where org_id = $1`, [ORG.acme]),
      },
      {
        who: "christina",
        tries: "mark onboarding finished for her org (org admin)",
        expect: "allowed",
        run: write(
          `update public.orgs set onboarded_at = now(), onboarding_step = 5 where id = $1`,
          [ORG.acme],
        ),
      },
      {
        who: "bob",
        tries: "change his org's onboarding progress",
        expect: "blocked",
        run: write(`update public.orgs set onboarded_at = now() where id = $1`, [ORG.acme]),
      },
    ],
  },
  {
    title: "Joining by invitation",
    cases: [
      {
        who: "ivy",
        tries: "see who invited her, to which org, and its components",
        expect: "allowed",
        run: async (db) => {
          const inv = await value<{ org_name: string; invited_by: string; components: unknown[] }>(
            db,
            `select public.my_invitation()`,
          );
          return check(
            inv?.org_name === "Acme Partners" &&
              inv.invited_by === "Christina" &&
              inv.components.length === 4,
            JSON.stringify(inv),
          );
        },
      },
      {
        who: "sam",
        tries: "read an invitation that isn't his",
        expect: "blocked",
        run: async (db) => {
          const inv = await value<unknown>(db, `select public.my_invitation()`);
          return check(inv != null, `got ${JSON.stringify(inv)}`);
        },
      },
      {
        who: "ivy",
        tries: "accept her invitation, joining Acme as a member with her usual areas",
        expect: "allowed",
        run: async (db) => {
          // One Acme area and one from another org: only Acme's is kept.
          await value(db, `select public.accept_invitation('Ivy Chen', array[$1, $2]::uuid[])`, [
            TYPE.ops,
            TYPE.betaTech,
          ]);
          const role = await value<string>(
            db,
            `select role from public.org_members where org_id = $1 and user_id = $2`,
            [ORG.acme, P.ivy],
          );
          const areas = await value<string[]>(
            db,
            `select usual_component_type_ids from public.org_members where org_id = $1 and user_id = $2`,
            [ORG.acme, P.ivy],
          );
          const status = await value<string>(db, `select public.signup_status()`);
          const accepted = await value<boolean>(
            db,
            `select accepted_at is not null from public.invitations where id = $1`,
            [INVITATION.ivyToAcme],
          );
          return check(
            role === "member" &&
              areas?.length === 1 &&
              areas[0] === TYPE.ops &&
              status === "joining" &&
              accepted === true,
            `role ${role}; areas ${JSON.stringify(areas)}; status ${status}; accepted ${accepted}`,
          );
        },
      },
      {
        who: "ivy",
        tries: "finish joining, then see Acme's capsules",
        expect: "allowed",
        run: async (db) => {
          await value(db, `select public.accept_invitation('Ivy', '{}')`);
          await attempt(
            db,
            `update public.org_members set onboarded_at = now() where org_id = $1 and user_id = $2`,
            [ORG.acme, P.ivy],
          );
          const status = await value<string>(db, `select public.signup_status()`);
          const sees = await attempt(db, `select 1 from public.capsules where id = $1`, [
            CAPSULE.en1,
          ]);
          return check(status === "member" && sees.allowed, `status ${status}; ${sees.detail}`);
        },
      },
      {
        who: "ivy",
        tries: "accept her invitation twice",
        expect: "blocked",
        run: async (db) => {
          await value(db, `select public.accept_invitation('Ivy', '{}')`);
          return write(`select public.accept_invitation('Ivy', '{}')`)(db);
        },
      },
      {
        who: "sam",
        tries: "accept an invitation that isn't his",
        expect: "blocked",
        run: write(`select public.accept_invitation('Sam', '{}')`),
      },
      {
        who: "christina",
        tries: "mark Dana's setup as finished for her",
        expect: "blocked",
        run: write(
          `update public.org_members set onboarded_at = null where org_id = $1 and user_id = $2`,
          [ORG.acme, P.dana],
        ),
      },
      {
        who: "christina",
        tries: "record that Ivy's invitation email was sent (org admin)",
        expect: "allowed",
        run: async (db) => {
          const n = await value<number>(
            db,
            `select public.mark_invitations_sent(array[$1]::uuid[])`,
            [INVITATION.ivyToAcme],
          );
          return check(n === 1, `${n} marked`);
        },
      },
      {
        who: "bob",
        tries: "record an invitation as sent (not an admin)",
        expect: "blocked",
        run: async (db) => {
          const n = await value<number>(
            db,
            `select public.mark_invitations_sent(array[$1]::uuid[])`,
            [INVITATION.ivyToAcme],
          );
          return check(n === 1, `${n} marked`);
        },
      },
      {
        who: "olga",
        tries: "record another org's invitation as sent",
        expect: "blocked",
        run: async (db) => {
          const n = await value<number>(
            db,
            `select public.mark_invitations_sent(array[$1]::uuid[])`,
            [INVITATION.ivyToAcme],
          );
          return check(n === 1, `${n} marked`);
        },
      },
    ],
  },
  {
    title: "One-click invite links",
    cases: [
      {
        who: "server",
        tries: "open Ivy's invite link, getting her email to sign her in",
        expect: "allowed",
        run: async (db) => {
          const email = await value<string>(db, `select public.redeem_invitation_link($1)`, [
            fingerprint(LINK.ivy),
          ]);
          return check(email === "ivy@acme.test", `got ${email}`);
        },
      },
      {
        who: "server",
        tries: "use Ivy's link a second time",
        expect: "blocked",
        run: async (db) => {
          await value(db, `select public.redeem_invitation_link($1)`, [fingerprint(LINK.ivy)]);
          const again = await value<string>(db, `select public.redeem_invitation_link($1)`, [
            fingerprint(LINK.ivy),
          ]);
          return check(again != null, `got ${again}`);
        },
      },
      {
        who: "server",
        tries: "use a link older than 7 days",
        expect: "blocked",
        run: async (db) => {
          const email = await value<string>(db, `select public.redeem_invitation_link($1)`, [
            fingerprint(LINK.expired),
          ]);
          return check(email != null, `got ${email}`);
        },
      },
      {
        who: "server",
        tries: "use the link of a withdrawn invitation",
        expect: "blocked",
        run: async (db) => {
          const email = await value<string>(db, `select public.redeem_invitation_link($1)`, [
            fingerprint(LINK.withdrawn),
          ]);
          return check(email != null, `got ${email}`);
        },
      },
      {
        who: "server",
        tries: "use a made-up link",
        expect: "blocked",
        run: async (db) => {
          const email = await value<string>(db, `select public.redeem_invitation_link($1)`, [
            fingerprint("guess"),
          ]);
          return check(email != null, `got ${email}`);
        },
      },
      {
        who: "christina",
        tries: "resend Ivy's invite, which replaces her old link with a new one",
        expect: "allowed",
        run: async (db) => {
          const ok = await value<boolean>(db, `select public.record_invitation_sent($1, $2)`, [
            INVITATION.ivyToAcme,
            fingerprint("new-ivy-link"),
          ]);
          // Switch to the server to try both links.
          await db.query(
            `select set_config('request.jwt.claims', '{"role":"service_role"}', true)`,
          );
          await db.query(`set local role service_role`);
          const old = await value<string>(db, `select public.redeem_invitation_link($1)`, [
            fingerprint(LINK.ivy),
          ]);
          const fresh = await value<string>(db, `select public.redeem_invitation_link($1)`, [
            fingerprint("new-ivy-link"),
          ]);
          return check(
            ok === true && old == null && fresh === "ivy@acme.test",
            `resent ${ok}; old ${old}; new ${fresh}`,
          );
        },
      },
      {
        who: "bob",
        tries: "record a new invite link (not an admin)",
        expect: "blocked",
        run: async (db) => {
          const ok = await value<boolean>(db, `select public.record_invitation_sent($1, $2)`, [
            INVITATION.ivyToAcme,
            fingerprint("bob-link"),
          ]);
          return check(ok === true, `${ok}`);
        },
      },
      {
        who: "ivy",
        tries: "redeem a link herself, without the server",
        expect: "blocked",
        run: write(`select public.redeem_invitation_link($1)`, [fingerprint(LINK.ivy)]),
      },
      {
        who: "signed out",
        tries: "redeem a link without the server",
        expect: "blocked",
        run: write(`select public.redeem_invitation_link($1)`, [fingerprint(LINK.ivy)]),
      },
    ],
  },
  {
    title: "Creating capsules",
    cases: [
      {
        who: "maya",
        tries:
          "create a capsule with Dana as owner, components, a collaborator and a work item, all at once",
        expect: "allowed",
        run: async (db) => {
          const res = await value<{ id: string; key: string }>(
            db,
            `select public.create_capsule($1::jsonb)`,
            [
              JSON.stringify({
                space_id: SPACE.en,
                name: "Partner portal refresh",
                outcome: "Refresh the partner portal before the summit.",
                launch_date: "2026-12-15",
                owner_id: P.dana,
                components: [
                  {
                    component_type_id: TYPE.tech,
                    owner_id: P.jon,
                    due_date: "2026-12-01",
                    goal: "New portal live",
                    collaborators: [P.bob],
                    items: [{ title: "Audit current pages", assignee_id: P.maya }, { title: "  " }],
                  },
                  { component_type_id: TYPE.sales, items: [] },
                ],
              }),
            ],
          );
          const cap = await value<{ owner_id: string; created_by: string }>(
            db,
            `select row_to_json(c) from (select owner_id, created_by from public.capsules where id = $1) c`,
            [res?.id],
          );
          const people = await value<string>(
            db,
            `select string_agg(user_id::text || ':' || source, ',' order by source) from public.component_people where capsule_id = $1`,
            [res?.id],
          );
          const items = await value<number>(
            db,
            `select count(*)::int from public.work_items where capsule_id = $1`,
            [res?.id],
          );
          return check(
            res?.key === "EN-3" &&
              cap?.owner_id === P.dana &&
              cap?.created_by === P.maya &&
              people === `${P.bob}:added,${P.maya}:assignment` &&
              items === 1,
            `key ${res?.key}; ${JSON.stringify(cap)}; people ${people}; items ${items}`,
          );
        },
      },
      {
        who: "olga",
        tries: "create a capsule in Acme's Engineering space",
        expect: "blocked",
        run: write(`select public.create_capsule($1::jsonb)`, [
          JSON.stringify({ space_id: SPACE.en, name: "Nope" }),
        ]),
      },
      {
        who: "christina",
        tries: "create a capsule owned by someone from another org",
        expect: "blocked",
        run: write(`select public.create_capsule($1::jsonb)`, [
          JSON.stringify({ space_id: SPACE.en, name: "Cross-org", owner_id: P.olga }),
        ]),
      },
      {
        who: "christina",
        tries: "create a capsule where one part fails, leaving nothing half-made",
        expect: "blocked",
        run: async (db) => {
          const r = await attempt(db, `select public.create_capsule($1::jsonb)`, [
            JSON.stringify({
              space_id: SPACE.en,
              name: "Half made",
              components: [{ component_type_id: TYPE.tech }, { component_type_id: TYPE.tech }],
            }),
          ]);
          const left = await value<number>(
            db,
            `select count(*)::int from public.capsules where name = 'Half made'`,
          );
          return check(r.allowed || left !== 0, `${r.detail}; capsules left behind: ${left}`);
        },
      },
      {
        who: "sam",
        tries: "create a capsule without being in any org",
        expect: "blocked",
        run: write(`select public.create_capsule($1::jsonb)`, [
          JSON.stringify({ space_id: SPACE.en, name: "Outsider" }),
        ]),
      },
      {
        who: "dana",
        tries: "set the goal for Tech, the component she owns",
        expect: "allowed",
        run: write(`update public.components set goal = 'API live for partners' where id = $1`, [
          COMP.en1Tech,
        ]),
      },
      {
        who: "jon",
        tries: "set the goal for Tech, which he doesn't own",
        expect: "blocked",
        run: write(`update public.components set goal = 'Mine' where id = $1`, [COMP.en1Tech]),
      },
    ],
  },
  {
    title: "Removing components",
    cases: [
      {
        who: "christina",
        tries: "remove Operations, moving its work items to Tech, then undo it exactly",
        expect: "allowed",
        run: async (db) => {
          const snap = await value<object>(db, `select public.remove_component($1, $2)`, [
            COMP.en1Ops,
            COMP.en1Tech,
          ]);
          const movedTo = await value<string>(
            db,
            `select component_id from public.work_items where id = $1`,
            [ITEM.opsRunbook],
          );
          const jonOnTech = await value<boolean>(
            db,
            `select exists (select 1 from public.component_people where component_id = $1 and user_id = $2)`,
            [COMP.en1Tech, P.jon],
          );
          await value(db, `select public.restore_component($1::jsonb)`, [JSON.stringify(snap)]);
          const back = await value<string>(
            db,
            `select component_id from public.work_items where id = $1`,
            [ITEM.opsRunbook],
          );
          const jonOnOps = await value<boolean>(
            db,
            `select exists (select 1 from public.component_people where component_id = $1 and user_id = $2)`,
            [COMP.en1Ops, P.jon],
          );
          const jonStillOnTech = await value<boolean>(
            db,
            `select exists (select 1 from public.component_people where component_id = $1 and user_id = $2)`,
            [COMP.en1Tech, P.jon],
          );
          return check(
            movedTo === COMP.en1Tech &&
              jonOnTech === true &&
              back === COMP.en1Ops &&
              jonOnOps === true &&
              jonStillOnTech === false,
            `moved to ${movedTo}; Jon on Tech ${jonOnTech}; back in ${back}; Jon on Ops ${jonOnOps}; still on Tech ${jonStillOnTech}`,
          );
        },
      },
      {
        who: "christina",
        tries: "remove Operations with its work items, then undo, getting the same items back",
        expect: "allowed",
        run: async (db) => {
          await attempt(db, `update public.work_items set done = true where id = $1`, [
            ITEM.opsTraining,
          ]);
          const snap = await value<object>(db, `select public.remove_component($1, null)`, [
            COMP.en1Ops,
          ]);
          const gone = await value<number>(
            db,
            `select count(*)::int from public.work_items where component_id = $1`,
            [COMP.en1Ops],
          );
          await value(db, `select public.restore_component($1::jsonb)`, [JSON.stringify(snap)]);
          const items = await value<string>(
            db,
            `select string_agg(id::text || ':' || done, ',' order by id) from public.work_items where component_id = $1`,
            [COMP.en1Ops],
          );
          return check(
            gone === 0 && items === `${ITEM.opsRunbook}:false,${ITEM.opsTraining}:true`,
            `left after remove ${gone}; restored ${items}`,
          );
        },
      },
      {
        who: "dana",
        tries: "remove a component (she only owns Tech)",
        expect: "blocked",
        run: write(`select public.remove_component($1, null)`, [COMP.en1Tech]),
      },
      {
        who: "christina",
        tries: "move a component's work items into another capsule",
        expect: "blocked",
        run: write(`select public.remove_component($1, $2)`, [COMP.en1Ops, COMP.en2Tech]),
      },
      {
        who: "dana",
        tries: "put back a component on a capsule she doesn't own",
        expect: "blocked",
        run: write(`select public.restore_component($1::jsonb)`, [
          JSON.stringify({
            component: {
              id: COMP.en1Sales,
              org_id: ORG.acme,
              capsule_id: CAPSULE.en1,
              component_type_id: TYPE.sales,
            },
            collaborators: [],
            items: [],
          }),
        ]),
      },
    ],
  },
  {
    title: "The activity log",
    cases: [
      {
        who: "christina",
        tries: "change EN-1's status, which logs who changed it, from what and to what",
        expect: "allowed",
        run: async (db) => {
          await attempt(db, `update public.capsules set status = 'in_review' where id = $1`, [
            CAPSULE.en1,
          ]);
          const entry = await value<string>(
            db,
            `select actor_user_id || ' ' || kind || ' ' || (data ->> 'field') || ' ' ||
                    (data ->> 'from') || '>' || (data ->> 'to')
             from public.events where capsule_id = $1 and kind <> 'comment'`,
            [CAPSULE.en1],
          );
          return check(
            entry === `${P.christina} capsule_changed status not_started>in_review`,
            String(entry),
          );
        },
      },
      {
        who: "dana",
        tries: "check off her work item, which logs it under her name",
        expect: "allowed",
        run: async (db) => {
          await attempt(db, `update public.work_items set done = true where id = $1`, [
            ITEM.techApi,
          ]);
          const entry = await value<string>(
            db,
            `select actor_user_id || ' ' || kind || ' ' || (data ->> 'field') || ' ' || (data ->> 'component')
             from public.events where capsule_id = $1 and kind <> 'comment'`,
            [CAPSULE.en1],
          );
          return check(entry === `${P.dana} item_changed done Tech`, String(entry));
        },
      },
      {
        who: "christina",
        tries: "remove Operations (moving its items) and undo it, which logs one entry for each",
        expect: "allowed",
        run: async (db) => {
          const snap = await value<object>(db, `select public.remove_component($1, $2)`, [
            COMP.en1Ops,
            COMP.en1Tech,
          ]);
          await value(db, `select public.restore_component($1::jsonb)`, [JSON.stringify(snap)]);
          const entries = await value<string>(
            db,
            `select string_agg(kind || coalesce(':' || (data ->> 'items') || ':' || (data ->> 'moved_to'), ''),
                               ',' order by created_at)
             from public.events where capsule_id = $1 and kind <> 'comment'`,
            [CAPSULE.en1],
          );
          return check(entries === "component_removed:2:Tech,component_restored", String(entries));
        },
      },
      {
        who: "christina",
        tries: "create a capsule, which logs one “created” entry (not one per component)",
        expect: "allowed",
        run: async (db) => {
          const made = await value<{ id: string }>(db, `select public.create_capsule($1::jsonb)`, [
            JSON.stringify({
              space_id: SPACE.en,
              name: "Logged capsule",
              components: [
                { component_type_id: TYPE.tech, items: [{ title: "First item" }] },
                { component_type_id: TYPE.ops },
              ],
            }),
          ]);
          const entries = await value<string>(
            db,
            `select string_agg(kind, ',') from public.events where capsule_id = $1`,
            [made!.id],
          );
          return check(entries === "capsule_created", String(entries));
        },
      },
      {
        who: "maya",
        tries: "read EN-1's activity (everyone in the org can see the capsule)",
        expect: "allowed",
        run: read(`select 1 from public.events where capsule_id = $1`, [CAPSULE.en1]),
      },
      {
        who: "olga",
        tries: "read EN-1's activity from another org",
        expect: "blocked",
        run: read(`select 1 from public.events where capsule_id = $1`, [CAPSULE.en1]),
      },
      {
        who: "jon",
        tries: "post a comment that @mentions Dana (on the team) and Bob (a follower)",
        expect: "allowed",
        run: async (db) => {
          const ev = await value<string>(db, `select public.post_comment($1, $2, $3)`, [
            CAPSULE.en1,
            "@Dana Kim @Bob can you both look?",
            [P.dana, P.bob],
          ]);
          const mentioned = await value<string>(
            db,
            `select string_agg(user_id::text, ',') from public.mentions where event_id = $1`,
            [ev],
          );
          return check(mentioned === P.dana, `mentions saved for: ${mentioned}`);
        },
      },
      {
        who: "bob",
        tries: "post a comment (followers are read-only)",
        expect: "blocked",
        run: write(`select public.post_comment($1, 'Looks good', '{}')`, [CAPSULE.en1]),
      },
      {
        who: "alex",
        tries: "post a comment (org admin, not on the team)",
        expect: "blocked",
        run: write(`select public.post_comment($1, 'Admin note', '{}')`, [CAPSULE.en1]),
      },
      {
        who: "jon",
        tries: "post a comment over 2,000 characters",
        expect: "blocked",
        run: write(`select public.post_comment($1, repeat('a', 2001), '{}')`, [CAPSULE.en1]),
      },
      {
        who: "christina",
        tries: "delete her own comment, then undo that",
        expect: "allowed",
        run: async (db) => {
          const del = await attempt(
            db,
            `insert into public.events (org_id, capsule_id, actor_user_id, kind, data)
             values ($1, $2, $3, 'comment_deleted', jsonb_build_object('comment_id', $4::text))`,
            [ORG.acme, CAPSULE.en1, P.christina, EVENT.en1Comment],
          );
          const undo = await attempt(
            db,
            `insert into public.events (org_id, capsule_id, actor_user_id, kind, data)
             values ($1, $2, $3, 'comment_restored', jsonb_build_object('comment_id', $4::text))`,
            [ORG.acme, CAPSULE.en1, P.christina, EVENT.en1Comment],
          );
          return check(del.allowed && undo.allowed, `${del.detail}; ${undo.detail}`);
        },
      },
      {
        who: "dana",
        tries: "delete Christina's comment",
        expect: "blocked",
        run: write(
          `insert into public.events (org_id, capsule_id, actor_user_id, kind, data)
           values ($1, $2, $3, 'comment_deleted', jsonb_build_object('comment_id', $4::text))`,
          [ORG.acme, CAPSULE.en1, P.dana, EVENT.en1Comment],
        ),
      },
      {
        who: "christina",
        tries: "file a delete for her EN-1 comment under a different capsule",
        expect: "blocked",
        run: write(
          `insert into public.events (org_id, capsule_id, actor_user_id, kind, data)
           values ($1, $2, $3, 'comment_deleted', jsonb_build_object('comment_id', $4::text))`,
          [ORG.acme, CAPSULE.en2, P.christina, EVENT.en1Comment],
        ),
      },
    ],
  },
  {
    title: "Work item statuses and collaborators",
    cases: [
      {
        who: "dana",
        tries: "add Jon to her work item with a piece, which puts him on the Tech team",
        expect: "allowed",
        run: async (db) => {
          await addPiece(db, P.jon, "Ranking service", "dana");
          const onTeam = await value<string>(
            db,
            `select source from public.component_people where component_id = $1 and user_id = $2`,
            [COMP.en1Tech, P.jon],
          );
          const logged = await value<string>(
            db,
            `select kind || ':' || (data ->> 'piece') from public.events
             where capsule_id = $1 and kind like 'piece%'`,
            [CAPSULE.en1],
          );
          return check(
            onTeam === "assignment" && logged === "piece_added:Ranking service",
            `team: ${onTeam}; logged ${logged}`,
          );
        },
      },
      {
        who: "maya",
        tries: "add herself as a collaborator on Dana's work item",
        expect: "blocked",
        run: write(
          `insert into public.work_item_collaborators
             (org_id, capsule_id, work_item_id, user_id, piece, created_by)
           values ($1, $2, $3, $4, 'Mine', $4)`,
          [ORG.acme, CAPSULE.en1, ITEM.techApi, P.maya],
        ),
      },
      {
        who: "jon",
        tries: "add Maya to an item he's assigned (he can manage his own item)",
        expect: "allowed",
        run: write(
          `insert into public.work_item_collaborators
             (org_id, capsule_id, work_item_id, user_id, piece, created_by)
           values ($1, $2, $3, $4, 'Docs', $5)`,
          [ORG.acme, CAPSULE.en1, ITEM.opsRunbook, P.maya, P.jon],
        ),
      },
      {
        who: "jon",
        tries: "start his piece, which moves the item to In progress without anyone setting it",
        expect: "allowed",
        run: async (db) => {
          const piece = await addPiece(db, P.jon, "Ranking service", "jon");
          await addPiece(db, P.christina, "Sales copy", "jon");
          const r = await attempt(
            db,
            `update public.work_item_collaborators set status = 'in_progress' where id = $1`,
            [piece],
          );
          const st = await itemStatus(db);
          const statusLogged = await value<number>(
            db,
            `select count(*)::int from public.events
             where capsule_id = $1 and kind = 'item_changed' and data ->> 'field' = 'status'`,
            [CAPSULE.en1],
          );
          return check(
            r.allowed && st === "in_progress:false:false:false" && statusLogged === 0,
            `${r.detail}; item ${st}; status entries ${statusLogged}`,
          );
        },
      },
      {
        who: "jon",
        tries: "finish the last piece, which checks the whole item off",
        expect: "allowed",
        run: async (db) => {
          const piece = await addPiece(db, P.jon, "Ranking service", "jon");
          await attempt(
            db,
            `update public.work_item_collaborators set status = 'done' where id = $1`,
            [piece],
          );
          return check(
            (await itemStatus(db)) === "done:true:false:true",
            String(await itemStatus(db)),
          );
        },
      },
      {
        who: "jon",
        tries: "change the status of Christina's piece",
        expect: "blocked",
        run: async (db) => {
          await addPiece(db, P.jon, "Ranking service", "jon");
          const hers = await addPiece(db, P.christina, "Sales copy", "jon");
          return attempt(
            db,
            `update public.work_item_collaborators set status = 'done' where id = $1`,
            [hers],
          );
        },
      },
      {
        who: "jon",
        tries: "make himself the lead",
        expect: "blocked",
        run: async (db) => {
          const piece = await addPiece(db, P.jon, "Ranking service", "jon");
          return attempt(
            db,
            `update public.work_item_collaborators set is_lead = true where id = $1`,
            [piece],
          );
        },
      },
      {
        who: "jon",
        tries: "as the lead, set the item to In review and add Maya to it",
        expect: "allowed",
        run: async (db) => {
          await addPiece(db, P.jon, "Ranking service", "jon", true);
          const st = await attempt(
            db,
            `update public.work_items set status = 'in_review' where id = $1`,
            [ITEM.techApi],
          );
          const add = await attempt(
            db,
            `insert into public.work_item_collaborators
               (org_id, capsule_id, work_item_id, user_id, piece, created_by)
             values ($1, $2, $3, $4, 'UI', $5)`,
            [ORG.acme, CAPSULE.en1, ITEM.techApi, P.maya, P.jon],
          );
          const now = await itemStatus(db);
          return check(
            st.allowed && add.allowed && now === "in_review:false:true:false",
            `${st.detail}; ${add.detail}; item ${now}`,
          );
        },
      },
      {
        who: "jon",
        tries: "as a collaborator (not the lead), set the item's status",
        expect: "blocked",
        run: async (db) => {
          await addPiece(db, P.jon, "Ranking service", "jon");
          return attempt(db, `update public.work_items set status = 'in_review' where id = $1`, [
            ITEM.techApi,
          ]);
        },
      },
      {
        who: "dana",
        tries: "make Christina the lead, which takes it from Jon",
        expect: "allowed",
        run: async (db) => {
          await addPiece(db, P.jon, "Ranking service", "dana", true);
          const hers = await addPiece(db, P.christina, "Sales copy", "dana");
          await attempt(
            db,
            `update public.work_item_collaborators set is_lead = true where id = $1`,
            [hers],
          );
          const leads = await value<string>(
            db,
            `select string_agg(user_id::text, ',') from public.work_item_collaborators
             where work_item_id = $1 and is_lead`,
            [ITEM.techApi],
          );
          return check(leads === P.christina, `leads: ${leads}`);
        },
      },
      {
        who: "dana",
        tries: "set the item's status by hand, then go back to the suggestion",
        expect: "allowed",
        run: async (db) => {
          const piece = await addPiece(db, P.jon, "Ranking service", "dana");
          await attempt(db, `update public.work_items set status = 'in_review' where id = $1`, [
            ITEM.techApi,
          ]);
          // The pieces moving on doesn't change a status set by hand.
          await attempt(
            db,
            `update public.work_item_collaborators set status = 'in_progress' where id = $1`,
            [piece],
          );
          const byHand = await itemStatus(db);
          await attempt(db, `update public.work_items set status_manual = false where id = $1`, [
            ITEM.techApi,
          ]);
          const back = await itemStatus(db);
          return check(
            byHand === "in_review:false:true:false" && back === "in_progress:false:false:false",
            `by hand ${byHand}; suggestion ${back}`,
          );
        },
      },
      {
        who: "dana",
        tries: "check off her item, which sets its status to Done",
        expect: "allowed",
        run: async (db) => {
          await attempt(db, `update public.work_items set done = true where id = $1`, [
            ITEM.techApi,
          ]);
          const st = await itemStatus(db);
          await attempt(db, `update public.work_items set status = 'in_progress' where id = $1`, [
            ITEM.techApi,
          ]);
          const reopened = await itemStatus(db);
          return check(
            st === "done:true:false:true" && reopened === "in_progress:false:false:false",
            `checked ${st}; reopened ${reopened}`,
          );
        },
      },
      {
        who: "dana",
        tries: "set a work item to Blocked (not a work item status)",
        expect: "blocked",
        run: write(`update public.work_items set status = 'blocked' where id = $1`, [ITEM.techApi]),
      },
      {
        who: "maya",
        tries: "set the status of Dana's work item",
        expect: "blocked",
        run: write(`update public.work_items set status = 'in_progress' where id = $1`, [
          ITEM.techApi,
        ]),
      },
      {
        who: "bob",
        tries: "see the collaborators on EN-1's work items (as a follower)",
        expect: "allowed",
        run: async (db) => {
          await addPiece(db, P.jon, "Ranking service", "bob");
          return attempt(
            db,
            `select 1 from public.work_item_collaborators where work_item_id = $1`,
            [ITEM.techApi],
          );
        },
      },
      {
        who: "bob",
        tries: "change a piece (followers are read-only)",
        expect: "blocked",
        run: async (db) => {
          const piece = await addPiece(db, P.jon, "Ranking service", "bob");
          return attempt(
            db,
            `update public.work_item_collaborators set piece = 'Mine' where id = $1`,
            [piece],
          );
        },
      },
      {
        who: "olga",
        tries: "see collaborators on Acme work items",
        expect: "blocked",
        run: read(`select 1 from public.work_item_collaborators`),
      },
      {
        who: "jon",
        tries: "leave the item himself, which takes him off the Tech team again",
        expect: "allowed",
        run: async (db) => {
          const piece = await addPiece(db, P.jon, "Ranking service", "jon");
          const r = await attempt(db, `delete from public.work_item_collaborators where id = $1`, [
            piece,
          ]);
          const onTeam = await value<boolean>(
            db,
            `select exists (select 1 from public.component_people where component_id = $1 and user_id = $2)`,
            [COMP.en1Tech, P.jon],
          );
          return check(r.allowed && onTeam === false, `${r.detail}; still on Tech: ${onTeam}`);
        },
      },
      {
        who: "jon",
        tries: "see his piece in Needs your attention",
        expect: "allowed",
        run: async (db) => {
          const piece = await addPiece(db, P.jon, "Ranking service", "jon");
          const row = await value<string>(
            db,
            `select kind || ':' || body from public.needs_attention() where target_id = $1`,
            [piece],
          );
          return check(row === "piece:Ranking service", String(row));
        },
      },
      {
        who: "christina",
        tries: "remove Tech with its work items, then undo, getting the collaborators back",
        expect: "allowed",
        run: async (db) => {
          await addPiece(db, P.jon, "Ranking service", "christina", true);
          const snap = await value<object>(db, `select public.remove_component($1, null)`, [
            COMP.en1Tech,
          ]);
          await value(db, `select public.restore_component($1::jsonb)`, [JSON.stringify(snap)]);
          const back = await value<string>(
            db,
            `select piece || ':' || is_lead from public.work_item_collaborators where work_item_id = $1`,
            [ITEM.techApi],
          );
          const onTeam = await value<boolean>(
            db,
            `select exists (select 1 from public.component_people where component_id = $1 and user_id = $2)`,
            [COMP.en1Tech, P.jon],
          );
          return check(
            back === "Ranking service:true" && onTeam === true,
            `${back}; on Tech ${onTeam}`,
          );
        },
      },
    ],
  },
  {
    title: "Using Capsule from an AI app (MCP)",
    cases: [
      {
        who: "christina",
        tries: "comment on EN-1 through Claude, shown as via Claude",
        expect: "allowed",
        run: async (db) => {
          await viaApp(db, "christina");
          const r = await attempt(
            db,
            `insert into public.events (org_id, capsule_id, actor_user_id, kind, data)
             values ($1, $2, $3, 'comment', '{"body":"Vendor signed"}')`,
            [ORG.acme, CAPSULE.en1, P.christina],
          );
          const src = await lastSource(db);
          return check(r.allowed && src === "comment:mcp:Claude", `${r.detail}; ${src}`);
        },
      },
      {
        who: "jon",
        tries: "add a work item through Claude, logged as via Claude",
        expect: "allowed",
        run: async (db) => {
          await viaApp(db, "jon");
          const r = await attempt(
            db,
            `insert into public.work_items (org_id, capsule_id, component_id, title, assignee_id, created_by)
             values ($1, $2, $3, 'Load test the API', $4, $4)`,
            [ORG.acme, CAPSULE.en1, COMP.en1Ops, P.jon],
          );
          const src = await lastSource(db);
          return check(r.allowed && src === "item_added:mcp:Claude", `${r.detail}; ${src}`);
        },
      },
      {
        who: "jon",
        tries: "rename Christina's capsule through Claude (he can't in the app either)",
        expect: "blocked",
        run: async (db) => {
          await viaApp(db, "jon");
          return attempt(db, `update public.capsules set name = 'Mine now' where id = $1`, [
            CAPSULE.en1,
          ]);
        },
      },
      {
        who: "bob",
        tries: "comment on EN-1 through Claude (followers are read-only)",
        expect: "blocked",
        run: async (db) => {
          await viaApp(db, "bob");
          return attempt(
            db,
            `insert into public.events (org_id, capsule_id, actor_user_id, kind, data)
             values ($1, $2, $3, 'comment', '{"body":"Hi"}')`,
            [ORG.acme, CAPSULE.en1, P.bob],
          );
        },
      },
      {
        who: "bob",
        tries: "read EN-1 through Claude, which he follows",
        expect: "allowed",
        run: async (db) => {
          await viaApp(db, "bob");
          return attempt(db, `select 1 from public.capsules where id = $1`, [CAPSULE.en1]);
        },
      },
      {
        who: "olga",
        tries: "see any Acme capsule through Claude",
        expect: "blocked",
        run: async (db) => {
          await viaApp(db, "olga");
          return attempt(db, `select 1 from public.capsules where org_id = $1`, [ORG.acme]);
        },
      },
      {
        who: "christina",
        tries: "post a comment in the app that claims to come from Claude",
        expect: "blocked",
        run: async (db) => {
          await db.query(
            `insert into public.events (org_id, capsule_id, actor_user_id, kind, data, source, agent_client)
             values ($1, $2, $3, 'comment', '{"body":"Sneaky"}', 'mcp', 'Claude')`,
            [ORG.acme, CAPSULE.en1, P.christina],
          );
          const src = await lastSource(db);
          return check(src !== "comment:app:-", `stored as ${src}`);
        },
      },
      {
        who: "christina",
        tries: "act through an app that gave no name, shown as An AI app",
        expect: "allowed",
        run: async (db) => {
          await viaApp(db, "christina", NAMELESS_APP);
          await db.query(
            `insert into public.events (org_id, capsule_id, actor_user_id, kind, data)
             values ($1, $2, $3, 'comment', '{"body":"Hello"}')`,
            [ORG.acme, CAPSULE.en1, P.christina],
          );
          const src = await lastSource(db);
          return check(src === "comment:mcp:An AI app", String(src));
        },
      },
      {
        who: "server",
        tries: "write an example entry marked via Claude (Example data)",
        expect: "allowed",
        run: async (db) => {
          await db.query(
            `insert into public.events (org_id, capsule_id, actor_user_id, kind, data, source, agent_client)
             values ($1, $2, $3, 'comment', '{"body":"Example"}', 'mcp', 'Claude')`,
            [ORG.acme, CAPSULE.en1, P.christina],
          );
          const src = await lastSource(db);
          return check(src === "comment:mcp:Claude", String(src));
        },
      },
      {
        who: "christina",
        tries: "see Claude in her connected apps",
        expect: "allowed",
        run: async (db) => {
          await viaApp(db, "christina");
          await signIn(db, "christina");
          const name = await value<string>(db, `select name from public.my_connected_apps()`);
          return check(name === "Claude", String(name));
        },
      },
      {
        who: "dana",
        tries: "see the apps Christina connected",
        expect: "blocked",
        run: async (db) => {
          await viaApp(db, "christina");
          await signIn(db, "dana");
          return attempt(db, `select 1 from public.my_connected_apps()`);
        },
      },
      {
        who: "signed out",
        tries: "list connected apps",
        expect: "blocked",
        run: read(`select 1 from public.my_connected_apps()`),
      },
    ],
  },
  {
    title: "Jira linking",
    cases: [
      {
        who: "jon",
        tries: "link a Jira issue to EN-1, logged with its key",
        expect: "allowed",
        run: async (db) => {
          const r = await attempt(db, `select public.link_work_item($1, $2::jsonb)`, [
            COMP.en1Ops,
            JIRA_ISSUE(),
          ]);
          const logged = await value<string>(
            db,
            `select kind || ':' || (data ->> 'source_key') from public.events
             where capsule_id = $1 order by created_at desc limit 1`,
            [CAPSULE.en1],
          );
          const item = await value<string>(
            db,
            `select source || ':' || status || ':' || source_status from public.work_items where source_key = 'ENG-142'`,
          );
          return check(
            r.allowed && logged === "item_added:ENG-142" && item === "jira:in_progress:In Progress",
            `${r.detail}; ${logged}; ${item}`,
          );
        },
      },
      {
        who: "jon",
        tries: "link the same issue to EN-1 twice",
        expect: "blocked",
        run: async (db) => {
          await linkAsJon(db);
          return attempt(db, `select public.link_work_item($1, $2::jsonb)`, [
            COMP.en1Tech,
            JIRA_ISSUE(),
          ]);
        },
      },
      {
        who: "bob",
        tries: "link a Jira issue to EN-1, which he only follows",
        expect: "blocked",
        run: read(`select public.link_work_item($1, $2::jsonb)`, [COMP.en1Ops, JIRA_ISSUE()]),
      },
      {
        who: "olga",
        tries: "link a Jira issue to an Acme capsule",
        expect: "blocked",
        run: read(`select public.link_work_item($1, $2::jsonb)`, [COMP.en1Ops, JIRA_ISSUE()]),
      },
      {
        who: "jon",
        tries: "add a work item that claims to be from Jira without linking it",
        expect: "blocked",
        run: write(
          `insert into public.work_items (org_id, capsule_id, component_id, title, created_by, source, source_key)
           values ($1, $2, $3, 'Fake', $4, 'jira', 'ENG-1')`,
          [ORG.acme, CAPSULE.en1, COMP.en1Ops, P.jon],
        ),
      },
      {
        who: "jon",
        tries: "check off a linked item in Capsule (done follows Jira)",
        expect: "blocked",
        run: async (db) => {
          const id = await linkAsJon(db);
          return attempt(db, `update public.work_items set done = true where id = $1`, [id]);
        },
      },
      {
        who: "christina",
        tries: "change a linked item's status or assignee as the capsule owner",
        expect: "blocked",
        run: async (db) => {
          const id = await linkAsJon(db, "christina");
          const a = await attempt(
            db,
            `update public.work_items set status = 'in_review' where id = $1`,
            [id],
          );
          const b = await attempt(
            db,
            `update public.work_items set assignee_id = $2 where id = $1`,
            [id, P.dana],
          );
          return check(a.allowed || b.allowed, `${a.detail}; ${b.detail}`);
        },
      },
      {
        who: "jon",
        tries: "rename a linked item he linked (the rename stays in Capsule)",
        expect: "allowed",
        run: async (db) => {
          const id = await linkAsJon(db);
          return attempt(db, `update public.work_items set title = 'Ranking API' where id = $1`, [
            id,
          ]);
        },
      },
      {
        who: "server",
        tries: "sync a linked item's status from Jira, with done following",
        expect: "allowed",
        run: async (db) => {
          const id = await linkAsJon(db);
          await db.query("reset role");
          await db.query("select set_config('request.jwt.claims', $1, true)", [
            JSON.stringify({ role: "service_role" }),
          ]);
          await db.query("set local role service_role");
          await db.query(
            `update public.work_items set status = 'done', source_status = 'Done' where id = $1`,
            [id],
          );
          const v = await value<string>(
            db,
            `select status || ':' || done from public.work_items where id = $1`,
            [id],
          );
          return check(v === "done:true", String(v));
        },
      },
      {
        who: "jon",
        tries: "link an open issue to a Done component, which moves it back to In progress",
        expect: "allowed",
        run: async (db) => {
          await db.query("reset role");
          await db.query(`update public.components set status = 'done' where id = $1`, [
            COMP.en1Ops,
          ]);
          await db.query("set local role authenticated");
          await db.query(`select public.link_work_item($1, $2::jsonb)`, [
            COMP.en1Ops,
            JIRA_ISSUE("ENG-7"),
          ]);
          const s = await value<string>(db, `select status from public.components where id = $1`, [
            COMP.en1Ops,
          ]);
          return check(s === "in_progress", String(s));
        },
      },
      {
        who: "christina",
        tries: "see her own Jira connection",
        expect: "allowed",
        run: async (db) => {
          await connectJira(db, "christina");
          return attempt(db, `select site_name from public.integrations where tool = 'jira'`);
        },
      },
      {
        who: "christina",
        tries: "read her own Jira tokens from the browser",
        expect: "blocked",
        run: async (db) => {
          await connectJira(db, "christina");
          return attempt(db, `select access_token, refresh_token from public.integrations`);
        },
      },
      {
        who: "dana",
        tries: "see Christina's Jira connection",
        expect: "blocked",
        run: async (db) => {
          await connectJira(db, "christina");
          await signIn(db, "dana");
          return attempt(db, `select 1 from public.integrations`);
        },
      },
      {
        who: "dana",
        tries: "disconnect Christina's Jira",
        expect: "blocked",
        run: async (db) => {
          await connectJira(db, "christina");
          await signIn(db, "dana");
          return attempt(db, `delete from public.integrations where user_id = $1`, [P.christina]);
        },
      },
      {
        who: "jon",
        tries: "disconnect his own Jira",
        expect: "allowed",
        run: async (db) => {
          await connectJira(db, "jon");
          return attempt(db, `delete from public.integrations where user_id = $1`, [P.jon]);
        },
      },
      {
        who: "jon",
        tries: "store a Jira connection himself (only the server can)",
        expect: "blocked",
        run: write(
          `insert into public.integrations (org_id, user_id, tool, site_id, site_url, access_token)
           values ($1, $2, 'jira', 'x', 'https://x.atlassian.net', 'stolen')`,
          [ORG.acme, P.jon],
        ),
      },
    ],
  },
];

const results: { group: string; who: string; tries: string; expect: Expect; got: Expect }[] = [];

for (const group of groups) {
  describe(group.title, () => {
    for (const c of group.cases) {
      const who =
        c.who === "signed out"
          ? "Signed out"
          : c.who === "server"
            ? "The app's server (secret key)"
            : NAMES[c.who];
      it(`${who} tries to ${c.tries}: ${c.expect}`, async () => {
        const outcome = await as(c.who, c.run);
        const got: Expect = outcome.allowed ? "allowed" : "blocked";
        results.push({ group: group.title, who, tries: c.tries, expect: c.expect, got });
        expect(got, outcome.detail).toBe(c.expect);
      });
    }
  });
}

afterAll(async () => {
  await pool.end();
  if (!process.env.ACCESS_REPORT) return;
  const lines = [
    "# Access rules: test results",
    "",
    "Generated by `npm run test:db:report`. Each row is an automated test that signs in as",
    "one person and tries something against the real database rules.",
    "",
    `**${results.filter((r) => r.got === r.expect).length} of ${results.length} passing.**`,
  ];
  for (const group of groups) {
    lines.push(
      "",
      `## ${group.title}`,
      "",
      "| Who | Tries to | Should be | Result |",
      "|---|---|---|---|",
    );
    for (const r of results.filter((x) => x.group === group.title)) {
      const mark = r.got === r.expect ? "✅" : "❌";
      lines.push(`| ${r.who} | ${r.tries} | ${r.expect} | ${mark} ${r.got} |`);
    }
  }
  writeFileSync("docs/access-rules.md", lines.join("\n") + "\n");
});
