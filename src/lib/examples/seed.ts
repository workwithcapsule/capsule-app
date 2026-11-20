import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/*
 * Example data for testing from your own account (docs/prelaunch.md: remove
 * before launch). Everything lives in one "Examples" space (key EX), so
 * removing it removes every example capsule, component, work item, comment
 * and follow with it. Example teammates are "+" versions of your own email,
 * labeled "(example)", so any email sent to them reaches you.
 *
 * Each build step adds its own example here (CLAUDE.md, Definition of done).
 */

export const EXAMPLE_SPACE = { name: "Examples", keyPrefix: "EX" };
const MARK = "Example data. Safe to delete from the Example data page.";

const TEAMMATES = [
  { key: "dana", name: "Dana (example)" },
  { key: "jon", name: "Jon (example)" },
  { key: "bob", name: "Bob (example)" },
] as const;
type Mate = (typeof TEAMMATES)[number]["key"];

/** Who may use the Example data page: the emails in EXAMPLE_DATA_EMAILS. */
export function examplesAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = (process.env.EXAMPLE_DATA_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.trim().toLowerCase());
}

/** "christina@gmail.com" + "bob" → "christina+bob@gmail.com". */
export function plusAddress(email: string, tag: string) {
  const [local, domain] = email.split("@");
  return `${local.split("+")[0]}+${tag}@${domain}`;
}

type Admin = SupabaseClient;
type Me = { id: string; email: string; orgId: string };

const day = 86_400_000;
const dateIn = (days: number) => new Date(Date.now() + days * day).toISOString().slice(0, 10);
const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

async function must<T>(
  p: PromiseLike<{ data: T; error: { message: string } | null }>,
  what: string,
): Promise<NonNullable<T>> {
  const { data, error } = await p;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data as NonNullable<T>;
}

/** Finds the example space, refusing to touch an EX space that isn't ours. */
async function findSpace(admin: Admin, orgId: string) {
  const { data } = await admin
    .from("spaces")
    .select("id, name, description")
    .eq("org_id", orgId)
    .eq("key_prefix", EXAMPLE_SPACE.keyPrefix)
    .maybeSingle();
  if (data && data.description !== MARK) {
    throw new Error(
      `You already have a real space with the key ${EXAMPLE_SPACE.keyPrefix}, so the examples can't use it.`,
    );
  }
  return data;
}

/** What's there now, for the page. */
export async function exampleStatus(admin: Admin, orgId: string) {
  const space = await findSpace(admin, orgId);
  if (!space) return { exists: false, capsules: [] as { key: string; name: string }[] };
  const { data } = await admin
    .from("capsules")
    .select("number, name")
    .eq("space_id", space.id)
    .order("number");
  return {
    exists: true,
    capsules: (data ?? []).map((c) => ({
      key: `${EXAMPLE_SPACE.keyPrefix}-${c.number}`,
      name: c.name,
    })),
  };
}

/** Removes the Examples space (and everything in it) and the example teammates. */
export async function removeExamples(admin: Admin, me: Me) {
  const space = await findSpace(admin, me.orgId);
  if (space) {
    // Stored files go first; deleting the space removes their records.
    const { data: caps } = await admin.from("capsules").select("id").eq("space_id", space.id);
    const ids = (caps ?? []).map((c) => c.id);
    if (ids.length) {
      const { data: files } = await admin
        .from("attachments")
        .select("storage_path")
        .in("capsule_id", ids)
        .not("storage_path", "is", null);
      const paths = (files ?? []).map((f) => f.storage_path as string);
      if (paths.length) await admin.storage.from("attachments").remove(paths);
    }
    await must(admin.from("spaces").delete().eq("id", space.id), "Removing the space");
  }
  const emails = TEAMMATES.map((t) => plusAddress(me.email, t.key));
  const { data: users } = await admin.from("users").select("id, email").in("email", emails);
  for (const u of users ?? []) {
    const { error } = await admin.auth.admin.deleteUser(u.id);
    if (error) throw new Error(`Removing ${u.email}: ${error.message}`);
  }
}

/** Makes (or reuses) the example teammates and puts them in your org. */
async function teammates(admin: Admin, me: Me): Promise<Record<Mate, string>> {
  const ids = {} as Record<Mate, string>;
  for (const t of TEAMMATES) {
    const email = plusAddress(me.email, t.key);
    const { data: found } = await admin.from("users").select("id").eq("email", email).maybeSingle();
    let id = found?.id as string | undefined;
    if (!id) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { name: t.name },
      });
      if (error || !data.user) throw new Error(`Adding ${t.name}: ${error?.message}`);
      id = data.user.id;
    }
    await must(admin.from("users").update({ name: t.name }).eq("id", id), "Naming a teammate");
    await must(
      admin
        .from("org_members")
        .upsert(
          { org_id: me.orgId, user_id: id, role: "member", onboarded_at: new Date().toISOString() },
          { onConflict: "org_id,user_id" },
        ),
      "Adding a teammate to your org",
    );
    ids[t.key] = id;
  }
  return ids;
}

/** Removes any old examples and builds a fresh set. Returns the new capsule keys. */
export async function seedExamples(admin: Admin, me: Me) {
  await removeExamples(admin, me);
  const mate = await teammates(admin, me);
  const { data: meRow } = await admin.from("users").select("name").eq("id", me.id).single();
  const myName = (meRow?.name as string | null)?.trim() || "you";
  const org = me.orgId;

  const types = await must(
    admin
      .from("component_types")
      .select("id, name")
      .eq("org_id", org)
      .is("archived_at", null)
      .order("position"),
    "Reading your components",
  );
  if (types.length < 3) throw new Error("Add at least 3 components in Settings first.");
  const [A, B, C] = types as { id: string; name: string }[];

  const space = await must(
    admin
      .from("spaces")
      .insert({
        org_id: org,
        name: EXAMPLE_SPACE.name,
        key_prefix: EXAMPLE_SPACE.keyPrefix,
        description: MARK,
        created_by: me.id,
      })
      .select("id")
      .single(),
    "Creating the Examples space",
  );
  await must(
    admin.from("space_members").upsert(
      Object.values(mate).map((user_id) => ({ org_id: org, space_id: space.id, user_id })),
      { onConflict: "space_id,user_id" },
    ),
    "Adding teammates to the space",
  );

  // Helpers -------------------------------------------------------------------
  const capsule = async (
    name: string,
    outcome: string,
    owner: string,
    status: string,
    launch: number,
  ) =>
    (
      await must(
        admin
          .from("capsules")
          .insert({
            org_id: org,
            space_id: space.id,
            name,
            outcome,
            owner_id: owner,
            created_by: owner,
            status,
            launch_date: dateIn(launch),
            created_at: ago(24 * 6),
          })
          .select("id, number")
          .single(),
        `Creating “${name}”`,
      )
    ).id as string;

  const component = async (
    cap: string,
    type: { id: string },
    owner: string | null,
    status: string,
    due: number | null,
    position: number,
    goal?: string,
  ) =>
    (
      await must(
        admin
          .from("components")
          .insert({
            org_id: org,
            capsule_id: cap,
            component_type_id: type.id,
            owner_id: owner,
            status,
            due_date: due === null ? null : dateIn(due),
            position,
            goal: goal ?? null,
            created_at: ago(30),
          })
          .select("id")
          .single(),
        "Adding a component",
      )
    ).id as string;

  const items = (cap: string, comp: string, list: [string, string | null, boolean?][]) =>
    must(
      admin.from("work_items").insert(
        list.map(([title, assignee, done], position) => ({
          org_id: org,
          capsule_id: cap,
          component_id: comp,
          title,
          assignee_id: assignee,
          done: done ?? false,
          position,
          created_by: me.id,
          // Assigned a day ago, so Home shows when it arrived.
          created_at: ago(26),
        })),
      ),
      "Adding work items",
    );

  const follow = (cap: string, user: string, hoursAgo: number) =>
    must(
      admin.from("followers").insert({
        org_id: org,
        capsule_id: cap,
        user_id: user,
        created_at: ago(hoursAgo),
      }),
      "Adding a follower",
    );

  const event = async (
    cap: string,
    actor: string,
    kind: string,
    data: Record<string, unknown>,
    hoursAgo: number,
    mentions: string[] = [],
    /** Made through an AI app ("Claude"), as the MCP server records it (step 13). */
    via?: string,
  ) => {
    const row = await must(
      admin
        .from("events")
        .insert({
          org_id: org,
          capsule_id: cap,
          actor_user_id: actor,
          kind,
          data,
          created_at: ago(hoursAgo),
          ...(via && { source: "mcp", agent_client: via }),
        })
        .select("id")
        .single(),
      "Adding activity",
    );
    if (mentions.length) {
      await must(
        admin.from("mentions").insert(
          mentions.map((user_id) => ({
            org_id: org,
            event_id: row.id,
            user_id,
            created_at: ago(hoursAgo),
          })),
        ),
        "Adding a mention",
      );
    }
  };
  const changed = (
    comp: string,
    type: { name: string },
    field: string,
    from: unknown,
    to: unknown,
  ) => ({
    component_id: comp,
    component: type.name,
    field,
    from,
    to,
  });

  // EX-1: You own it -----------------------------------------------------------
  const ex1 = await capsule(
    "Partner leaderboard launch",
    "Partners can see where they rank and what to do next.",
    me.id,
    "in_progress",
    33,
  );
  const ex1a = await component(
    ex1,
    A,
    mate.dana,
    "in_progress",
    3, // due soon: your "Review the partner data model" shows as due soon on Home
    0,
    "The leaderboard API is live",
  );
  const ex1b = await component(ex1, B, null, "blocked", 7, 1);
  const ex1c = await component(ex1, C, mate.jon, "not_started", 21, 2);
  await items(ex1, ex1a, [
    ["Build the leaderboard API", mate.dana],
    ["Review the partner data model", me.id],
    ["Load test with sample partners", mate.dana, true],
  ]);
  await items(ex1, ex1b, [["Confirm partner pricing tiers", null]]);
  await items(ex1, ex1c, [
    ["Write the launch runbook", mate.jon],
    ["Train the support team", me.id],
  ]);
  await must(
    admin
      .from("component_people")
      .upsert(
        { org_id: org, capsule_id: ex1, component_id: ex1a, user_id: mate.jon, source: "added" },
        { onConflict: "component_id,user_id" },
      ),
    "Adding a collaborator",
  );
  await follow(ex1, mate.bob, 30);

  // Work item collaborators and statuses (step 12). "Ship the leaderboard
  // page" has three people on it, you as the lead, and follows their pieces
  // (In progress). On Jon's runbook you have a part (it shows on Home), and
  // Jon set the status by hand, so the drawer offers "Use suggestion".
  const item = async (
    comp: string,
    title: string,
    assignee: string | null,
    extra: Record<string, unknown> = {},
  ) =>
    (
      await must(
        admin
          .from("work_items")
          .insert({
            org_id: org,
            capsule_id: ex1,
            component_id: comp,
            title,
            assignee_id: assignee,
            position: 3,
            created_by: me.id,
            created_at: ago(30),
            ...extra,
          })
          .select("id")
          .single(),
        "Adding a work item",
      )
    ).id as string;
  const pieces = (
    itemId: string,
    list: [string, string, "not_started" | "in_progress" | "in_review" | "done", boolean?][],
  ) =>
    must(
      admin.from("work_item_collaborators").insert(
        list.map(([user_id, piece, status, is_lead]) => ({
          org_id: org,
          capsule_id: ex1,
          work_item_id: itemId,
          user_id,
          piece,
          status,
          is_lead: is_lead ?? false,
          created_by: me.id,
          created_at: ago(28),
        })),
      ),
      "Adding collaborators",
    );
  const shipPage = await item(ex1a, "Ship the partner leaderboard page", me.id, {
    note: "Ranking comes from the API; the page shows the top 50 partners and what each can do next.",
  });
  await pieces(shipPage, [
    [mate.dana, "Ranking service", "done"],
    [mate.jon, "Leaderboard UI", "in_progress"],
    [me.id, "Final review", "not_started", true],
  ]);
  const runbook = (
    await must(
      admin
        .from("work_items")
        .select("id")
        .eq("component_id", ex1c)
        .eq("title", "Write the launch runbook")
        .single(),
      "Finding the runbook",
    )
  ).id as string;
  await pieces(runbook, [[me.id, "Escalation steps", "in_progress"]]);
  await must(
    admin.from("work_items").update({ status: "in_review", status_manual: true }).eq("id", runbook),
    "Setting the runbook's status",
  );
  // Linked Jira issues (step 14): what linked items look like, without
  // connecting Jira. Not tied to anyone's Jira account, so they never sync,
  // and their links point at a sample site that doesn't exist.
  await must(
    admin.from("work_items").insert(
      [
        [
          "PART-42",
          "Rank partners by weekly deal volume",
          "in_review",
          "Code Review",
          "indeterminate",
          mate.dana,
          "Dana (example)",
        ],
        [
          "PART-57",
          "Leaderboard API rate limits",
          "in_progress",
          "In Progress",
          "indeterminate",
          null,
          "Sam Ortiz",
        ],
      ].map(([key, title, status, statusName, category, assignee, assigneeName], i) => ({
        org_id: org,
        capsule_id: ex1,
        component_id: ex1a,
        title,
        assignee_id: assignee,
        status,
        position: 50 + i,
        created_by: me.id,
        created_at: ago(20),
        source: "jira",
        source_key: key,
        source_url: `https://example.atlassian.net/browse/${key}`,
        source_id: `ex-${key}`,
        source_title: title,
        source_status: statusName,
        source_status_category: category,
        source_assignee: assigneeName,
        synced_at: ago(0.2),
      })),
    ),
    "Adding linked Jira examples",
  );
  const piece = (title: string, comp: string, type: { name: string }) => ({
    title,
    component_id: comp,
    component: type.name,
  });
  await event(
    ex1,
    me.id,
    "piece_added",
    {
      item_id: shipPage,
      ...piece("Ship the partner leaderboard page", ex1a, A),
      user: mate.jon,
      piece: "Leaderboard UI",
    },
    28,
  );
  await event(
    ex1,
    mate.dana,
    "piece_changed",
    {
      item_id: shipPage,
      ...piece("Ship the partner leaderboard page", ex1a, A),
      user: mate.dana,
      piece: "Ranking service",
      field: "status",
      from: "in_progress",
      to: "done",
    },
    4,
  );
  await event(
    ex1,
    mate.jon,
    "piece_added",
    {
      item_id: runbook,
      ...piece("Write the launch runbook", ex1c, C),
      user: me.id,
      piece: "Escalation steps",
    },
    25,
  );
  await event(
    ex1,
    mate.jon,
    "item_changed",
    {
      item_id: runbook,
      ...piece("Write the launch runbook", ex1c, C),
      field: "status",
      from: "in_progress",
      to: "in_review",
    },
    3,
  );

  await event(ex1, me.id, "capsule_created", { name: "Partner leaderboard launch" }, 24 * 6);
  await event(
    ex1,
    me.id,
    "capsule_changed",
    { field: "launch_date", from: dateIn(26), to: dateIn(33) },
    26,
  );
  await event(
    ex1,
    me.id,
    "component_changed",
    changed(ex1b, B, "status", "in_progress", "blocked"),
    20,
  );
  await event(
    ex1,
    mate.dana,
    "item_changed",
    {
      item_id: null,
      title: "Load test with sample partners",
      component_id: ex1a,
      component: A.name,
      field: "done",
      from: false,
      to: true,
    },
    5,
  );
  await event(
    ex1,
    mate.dana,
    "comment",
    {
      body: `@${myName} can you confirm the partner pricing tiers by Friday? ${B.name} is blocked on it.`,
    },
    2,
    [me.id],
  );
  await event(ex1, mate.jon, "comment", { body: "Runbook draft goes up tomorrow." }, 0.7);
  // Through an AI app (step 13): shown as "via Claude", with the app's badge.
  await event(
    ex1,
    mate.dana,
    "comment",
    {
      body: "Summary of this week’s partner feedback: most want the ranking explained on the page, and two asked for a CSV export.",
    },
    0.5,
    [],
    "Claude",
  );
  await event(
    ex1,
    me.id,
    "item_added",
    {
      item_id: null,
      title: "Add a “How ranking works” note",
      component_id: ex1a,
      component: A.name,
    },
    0.4,
    [],
    "Claude",
  );

  // Attachments (step 10): links of different kinds, and a small PDF.
  const attach = async (
    cap: string,
    by: string,
    hoursAgo: number,
    a: { name: string } & ({ url: string; link_type: string } | { file: string }),
  ) => {
    let file: Record<string, unknown>;
    if ("file" in a) {
      const path = `${cap}/${crypto.randomUUID()}/${a.file}`;
      const { error } = await admin.storage
        .from("attachments")
        .upload(path, examplePdf(a.name), { contentType: "application/pdf" });
      if (error) throw new Error(`Uploading an example file: ${error.message}`);
      file = {
        kind: "file",
        storage_path: path,
        size_bytes: examplePdf(a.name).length,
        mime_type: "application/pdf",
      };
    } else {
      file = { kind: "link", url: a.url, link_type: a.link_type };
    }
    await must(
      admin.from("attachments").insert({
        org_id: org,
        capsule_id: cap,
        name: a.name,
        added_by: by,
        created_at: ago(hoursAgo),
        ...file,
      }),
      "Adding an attachment",
    );
  };
  await attach(ex1, me.id, 24 * 5, {
    name: "Partner leaderboard PRD",
    url: "https://docs.google.com/document/d/example-leaderboard-prd",
    link_type: "google_docs",
  });
  await attach(ex1, mate.dana, 30, {
    name: "Leaderboard designs v4",
    url: "https://www.figma.com/file/example/leaderboard-designs-v4",
    link_type: "figma",
  });
  await attach(ex1, mate.jon, 6, {
    name: "Launch-messaging-v3.pdf",
    file: "Launch-messaging-v3.pdf",
  });

  // EX-2: You work on it -------------------------------------------------------
  const ex2 = await capsule(
    "Q1 partner newsletter",
    "Every partner hears about the new program in one email.",
    mate.dana,
    "in_progress",
    18,
  );
  const ex2a = await component(ex2, A, mate.dana, "done", -2, 0);
  const ex2b = await component(
    ex2,
    B,
    me.id,
    "in_progress",
    -1, // overdue: shows first in your Needs your attention
    1,
    "Announcement approved and scheduled",
  );
  await items(ex2, ex2a, [["Pull the partner list", mate.dana, true]]);
  await items(ex2, ex2b, [
    ["Draft the announcement", me.id],
    ["Get legal sign-off", mate.jon],
  ]);
  await event(ex2, mate.dana, "capsule_created", { name: "Q1 partner newsletter" }, 24 * 3);
  await event(
    ex2,
    mate.dana,
    "component_changed",
    changed(ex2a, A, "status", "in_review", "done"),
    24,
  );
  await event(
    ex2,
    mate.dana,
    "comment",
    { body: `Handing ${B.name} to you, @${myName}. The partner list is ready.` },
    3,
    [me.id],
  );

  // EX-3: You follow it (the follower view) ------------------------------------
  const ex3 = await capsule(
    "Partner portal redesign",
    "Partners find what they need in two clicks.",
    mate.bob,
    "in_review",
    20,
  );
  const ex3a = await component(ex3, A, mate.bob, "done", -1, 0);
  const ex3b = await component(ex3, B, mate.jon, "blocked", 3, 1);
  const ex3c = await component(ex3, C, mate.dana, "in_progress", 10, 2);
  await items(ex3, ex3a, [["Ship the new navigation", mate.bob, true]]);
  await items(ex3, ex3b, [["Sign the vendor contract", mate.jon]]);
  await items(ex3, ex3c, [
    ["Update the help articles", mate.dana, true],
    ["Record a walkthrough video", mate.dana],
  ]);
  await follow(ex3, me.id, 40);
  await attach(ex3, mate.bob, 26, {
    name: "Portal walkthrough",
    url: "https://www.loom.com/share/example-portal-walkthrough",
    link_type: "loom",
  });
  await event(ex3, mate.bob, "capsule_created", { name: "Partner portal redesign" }, 24 * 6);
  await event(
    ex3,
    mate.bob,
    "capsule_changed",
    { field: "launch_date", from: dateIn(13), to: dateIn(20) },
    22,
  );
  await event(
    ex3,
    mate.bob,
    "component_changed",
    changed(ex3a, A, "status", "in_review", "done"),
    20,
  );
  await event(
    ex3,
    mate.jon,
    "component_changed",
    changed(ex3b, B, "status", "in_progress", "blocked"),
    4,
  );
  await event(
    ex3,
    mate.dana,
    "item_changed",
    {
      item_id: null,
      title: "Update the help articles",
      component_id: ex3c,
      component: C.name,
      field: "done",
      from: false,
      to: true,
    },
    3,
  );
  await event(
    ex3,
    mate.bob,
    "comment",
    { body: `${B.name} is waiting on the vendor contract. New date next week.` },
    1,
  );

  // EX-4: You can see it (not on the team, not following) ----------------------
  const ex4 = await capsule(
    "Partner referral program",
    "Partners refer partners, and we reward both.",
    mate.jon,
    "not_started",
    45,
  );
  const ex4a = await component(ex4, A, mate.jon, "not_started", 30, 0);
  await items(ex4, ex4a, [["Scope the referral rewards", mate.jon]]);
  await event(ex4, mate.jon, "capsule_created", { name: "Partner referral program" }, 24);

  return exampleStatus(admin, org);
}

/** A tiny one-page PDF with a title, so example files open as real PDFs. */
function examplePdf(title: string): Buffer {
  const text = title.replace(/[()\\]/g, "");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const stream = `BT /F1 24 Tf 72 700 Td (${text}) Tj ET\nBT /F1 12 Tf 72 670 Td (Example file from Capsule's Example data.) Tj ET`;
  objects[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}
