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
  if (space) await must(admin.from("spaces").delete().eq("id", space.id), "Removing the space");
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
        })
        .select("id")
        .single(),
      "Adding activity",
    );
    if (mentions.length) {
      await must(
        admin
          .from("mentions")
          .insert(mentions.map((user_id) => ({ org_id: org, event_id: row.id, user_id }))),
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
    14,
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
    7,
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
