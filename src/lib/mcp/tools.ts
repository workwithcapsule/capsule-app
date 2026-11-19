import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  addWorkItem,
  createCapsule,
  postComment,
  updateWorkItem,
} from "@/app/(app)/capsules/actions";
import { searchCapsules } from "@/app/(app)/search/actions";
import { buildFeed, describe, splitMentions } from "@/lib/activity";
import type { AttentionRow } from "@/lib/attention";
import type { CapsuleData, PersonRef } from "@/lib/capsule-types";
import { loadCapsule, loadPeople } from "@/lib/capsules";
import { STATUS_META } from "@/lib/design";
import { loadAttention } from "@/lib/home";
import { siteOrigin } from "@/lib/site";
import { loadSpacesDirectory } from "@/lib/spaces";
import { createClient } from "@/lib/supabase/server";
import { ITEM_STATUSES, type ItemStatus } from "@/lib/work-items";

/*
 * What an AI app can see and do in Capsule (step 13, build-decisions.md 58).
 *
 * Every tool runs as the person who connected the app, through the same
 * loaders and actions as the app, so the database's rules decide what's
 * allowed. No tool removes or deletes anything.
 */

type Result = { content: { type: "text"; text: string }[]; isError?: boolean };

const ok = (value: unknown): Result => ({
  content: [
    { type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) },
  ],
});
const fail = (message: string): Result => ({
  content: [{ type: "text", text: message }],
  isError: true,
});

const statusLabel = (s: string) => STATUS_META[s as ItemStatus]?.label ?? s;
const ATTENTION_LABEL: Record<AttentionRow["kind"], string> = {
  item: "Work item assigned to you",
  component: "Component you own",
  no_owner: "Component with no owner, on your capsule",
  mention: "You were @mentioned",
  piece: "Your part of a work item",
};

async function capsuleUrl(key: string) {
  return `${await siteOrigin()}/capsules/${key.toLowerCase()}`;
}

const keyField = z
  .string()
  .min(2)
  .max(20)
  .describe('The capsule\'s key, like "EN-4" (space prefix and number).');

/** Finds one person by name, first name or email. "me" is the person using the app. */
function findPerson(people: PersonRef[], query: string, meId: string) {
  const q = query.trim().toLowerCase().replace(/^@/, "");
  if (["me", "myself", "i"].includes(q)) return { id: meId };
  const exact = people.filter((p) => p.name.toLowerCase() === q);
  if (exact.length === 1) return { id: exact[0].id };
  const first = people.filter((p) => p.name.toLowerCase().split(/\s+/)[0] === q);
  if (first.length === 1) return { id: first[0].id };
  const options = (exact.length ? exact : first).map((p) => p.name);
  return {
    error: options.length
      ? `More than one person matches "${query}": ${options.join(", ")}. Use their full name.`
      : `No one called "${query}" is in this organization.`,
  };
}

async function loadOrFail(key: string): Promise<CapsuleData | string> {
  const data = await loadCapsule(key.trim().replace(/\s+/, "-"));
  return data ?? `There's no capsule ${key.toUpperCase()} that you can see.`;
}

function findComponent(data: CapsuleData, name: string) {
  const q = name.trim().toLowerCase();
  const comp = data.components.find((c) => c.name.toLowerCase() === q);
  return (
    comp ?? {
      error: `${data.capsule.key} has no ${name} component. Its components are: ${
        data.components.map((c) => c.name).join(", ") || "none yet"
      }.`,
    }
  );
}

/** A capsule, readable: components, their work items and team, and recent activity. */
async function describeCapsule(data: CapsuleData) {
  const nameOf = (id: string | null) =>
    id ? (data.people.find((p) => p.id === id)?.name ?? "Someone") : null;
  const feed = buildFeed(data.activity).slice(0, 20);
  return {
    key: data.capsule.key,
    name: data.capsule.name,
    url: await capsuleUrl(data.capsule.key),
    space: data.capsule.space.name,
    outcome: data.capsule.outcome,
    status: statusLabel(data.capsule.status),
    [data.capsule.dateType === "due" ? "dueDate" : "launchDate"]: data.capsule.launchDate,
    owner: nameOf(data.capsule.ownerId),
    components: data.components.map((c) => ({
      name: c.name,
      owner: nameOf(c.ownerId),
      status: statusLabel(c.status),
      dueDate: c.dueDate,
      goal: c.goal,
      team: [...new Set([c.ownerId, ...c.collaborators.map((p) => p.userId)].filter(Boolean))].map(
        (id) => nameOf(id as string),
      ),
      workItems: data.items
        .filter((i) => i.componentId === c.id)
        .map((i) => ({
          id: i.id,
          title: i.title,
          status: statusLabel(i.status),
          assignee: nameOf(i.assigneeId),
          note: i.note,
          collaborators: data.pieces
            .filter((p) => p.itemId === i.id)
            .map((p) => ({
              person: nameOf(p.userId),
              part: p.piece,
              status: statusLabel(p.status),
              lead: p.isLead,
            })),
        })),
    })),
    followers: data.followers.map((f) => nameOf(f.userId)),
    recentActivity: feed.map((e) => {
      const who = e.actorId === data.me.id ? "You" : (nameOf(e.actorId) ?? "Someone");
      const via = e.via ? ` via ${e.via}` : "";
      const body = e.kind === "comment" ? `: ${String(e.data.body ?? "")}` : "";
      return {
        at: e.at,
        what: `${who}${via} ${describe(e, {
          meId: data.me.id,
          nameOf: (id) => nameOf(id) ?? undefined,
          dateType: data.capsule.dateType,
        })}${body}`,
      };
    }),
  };
}

export function registerTools(server: McpServer) {
  // Seeing ------------------------------------------------------------------

  server.registerTool(
    "get_needs_attention",
    {
      title: "Needs your attention",
      description:
        "What needs the person in Capsule right now, as on their Home page: work items assigned to them, components they own, their parts of work items, components with no owner on their capsules, and @mentions.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const rows = await loadAttention();
      if (!rows.length) return ok("Nothing needs you right now.");
      return ok(
        await Promise.all(
          rows.map(async (r) => ({
            what: ATTENTION_LABEL[r.kind],
            title: r.title,
            ...(r.body && { detail: r.body }),
            capsule: `${r.capsuleKey} ${r.capsuleName}`,
            component: r.componentName,
            dueDate: r.dueDate,
            since: r.since,
            url: await capsuleUrl(r.capsuleKey),
          })),
        ),
      );
    },
  );

  server.registerTool(
    "list_my_work_items",
    {
      title: "My work items",
      description:
        "Work items assigned to the person, across every capsule they can see. Open items only, unless include_done is true.",
      inputSchema: z.object({
        include_done: z.boolean().optional().describe("Also list items that are done."),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ include_done }) => {
      const supabase = await createClient();
      const { data: claims } = await supabase.auth.getClaims();
      const me = claims?.claims?.sub as string;
      let q = supabase
        .from("work_items")
        .select("id, title, status, note, capsule_id, component_id")
        .eq("assignee_id", me)
        .order("updated_at", { ascending: false })
        .limit(100);
      if (!include_done) q = q.eq("done", false);
      const { data: items, error } = await q;
      if (error) return fail("Couldn't load your work items. Try again.");
      if (!items?.length) return ok("No work items are assigned to you.");
      const [{ data: caps }, { data: comps }] = await Promise.all([
        supabase
          .from("capsules")
          .select("id, number, name, archived_at, spaces(key_prefix)")
          .in("id", [...new Set(items.map((i) => i.capsule_id))]),
        supabase
          .from("components")
          .select("id, component_types(name)")
          .in("id", [...new Set(items.map((i) => i.component_id))]),
      ]);
      const capById = new Map(
        (caps ?? []).map((c) => [
          c.id,
          {
            label: `${(c.spaces as unknown as { key_prefix: string } | null)?.key_prefix}-${c.number} ${c.name}`,
            archived: Boolean(c.archived_at),
          },
        ]),
      );
      const compName = new Map(
        (comps ?? []).map((c) => [
          c.id,
          (c.component_types as unknown as { name: string } | null)?.name ?? null,
        ]),
      );
      const rows = items.filter(
        (i) => capById.get(i.capsule_id) && !capById.get(i.capsule_id)!.archived,
      );
      if (!rows.length) return ok("No work items are assigned to you.");
      return ok(
        rows.map((r) => ({
          id: r.id,
          title: r.title,
          status: statusLabel(r.status),
          capsule: capById.get(r.capsule_id)!.label,
          component: compName.get(r.component_id) ?? null,
          note: r.note,
        })),
      );
    },
  );

  server.registerTool(
    "search_capsules",
    {
      title: "Search capsules",
      description:
        'Find capsules by name or key ("EN-4", "EN"). With an empty query, lists the person\'s most recently updated capsules.',
      inputSchema: z.object({
        query: z.string().max(100).describe("Words from the name, or a key."),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ query }) => {
      const hits = await searchCapsules(query);
      if (!hits.length) return ok("No capsules match.");
      return ok(
        await Promise.all(
          hits.map(async (h) => ({
            key: h.key,
            name: h.name,
            space: h.space,
            onYourTeamOrFollowed: h.yours,
            url: await capsuleUrl(h.key),
          })),
        ),
      );
    },
  );

  server.registerTool(
    "get_capsule",
    {
      title: "Get a capsule",
      description:
        "One capsule in full: outcome, status, date, owner, each component (owner, status, due date, goal, team) with its work items, followers and recent activity. Work item ids here are what update_work_item needs.",
      inputSchema: z.object({ capsule: keyField }),
      annotations: { readOnlyHint: true },
    },
    async ({ capsule }) => {
      const data = await loadOrFail(capsule);
      if (typeof data === "string") return fail(data);
      return ok(await describeCapsule(data));
    },
  );

  server.registerTool(
    "list_spaces",
    {
      title: "List spaces",
      description:
        "The spaces in the person's organization (each has a key prefix, like EN), whether they've joined each, and how many capsules each has. A new capsule goes into a space.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const dir = await loadSpacesDirectory();
      if (!dir) return fail("You're not in an organization yet.");
      return ok({
        organization: dir.orgName,
        spaces: dir.spaces.map((s) => ({
          name: s.name,
          keyPrefix: s.keyPrefix,
          description: s.description,
          joined: s.joined,
          capsules: s.capsuleCount,
        })),
      });
    },
  );

  // Doing -------------------------------------------------------------------

  server.registerTool(
    "create_capsule",
    {
      title: "Create a capsule",
      description:
        "Start a new capsule in a space, optionally with components (from the organization's component list, like Tech or Marketing), their owners, due dates and goals, and first work items. The person becomes its owner unless another owner is given. Component owners are emailed, as when someone creates one in the app.",
      inputSchema: z.object({
        space: z.string().describe('The space\'s name or key prefix, like "Engineering" or "EN".'),
        name: z.string().min(1).max(120),
        outcome: z.string().max(500).optional().describe("What success looks like."),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe("Launch (or due) date, YYYY-MM-DD."),
        date_type: z.enum(["launch", "due"]).optional(),
        owner: z.string().optional().describe('Who owns it: a name, or "me" (the default).'),
        components: z
          .array(
            z.object({
              component: z
                .string()
                .describe('A component from the organization\'s list, like "Tech".'),
              owner: z.string().optional(),
              due_date: z
                .string()
                .regex(/^\d{4}-\d{2}-\d{2}$/)
                .optional(),
              goal: z.string().max(500).optional(),
              work_items: z
                .array(
                  z.object({
                    title: z.string().min(1).max(200),
                    assignee: z.string().optional(),
                  }),
                )
                .max(30)
                .optional(),
            }),
          )
          .max(10)
          .optional(),
      }),
    },
    async (input) => {
      const dir = await loadSpacesDirectory();
      if (!dir) return fail("You're not in an organization yet.");
      const q = input.space.trim().toLowerCase();
      const space = dir.spaces.find(
        (s) => s.keyPrefix.toLowerCase() === q || s.name.toLowerCase() === q,
      );
      if (!space)
        return fail(
          `There's no space called "${input.space}". Spaces: ${dir.spaces.map((s) => `${s.name} (${s.keyPrefix})`).join(", ")}.`,
        );
      const people = await loadPeople(dir.orgId);
      const person = (name: string | undefined) => {
        if (!name) return { id: null as string | null };
        const r = findPerson(people, name, dir.userId);
        if ("error" in r) throw new Error(r.error);
        return { id: r.id as string | null };
      };
      const supabase = await createClient();
      const { data: types } = await supabase
        .from("component_types")
        .select("id, name")
        .eq("org_id", dir.orgId)
        .is("archived_at", null);
      try {
        const components = (input.components ?? []).map((c) => {
          const type = (types ?? []).find(
            (t) => t.name.toLowerCase() === c.component.trim().toLowerCase(),
          );
          if (!type)
            throw new Error(
              `"${c.component}" isn't one of your organization's components: ${(types ?? []).map((t) => t.name).join(", ")}.`,
            );
          return {
            component_type_id: type.id,
            owner_id: person(c.owner).id,
            due_date: c.due_date ?? null,
            goal: c.goal ?? null,
            collaborators: [],
            items: (c.work_items ?? []).map((i) => ({
              title: i.title,
              assignee_id: person(i.assignee).id,
            })),
          };
        });
        const r = await createCapsule({
          space_id: space.id,
          name: input.name,
          outcome: input.outcome ?? null,
          launch_date: input.date ?? null,
          date_type: input.date_type ?? "launch",
          owner_id: person(input.owner ?? "me").id,
          components,
        });
        if (!r.ok) return fail(r.error);
        return ok({ created: r.data!.key, url: await capsuleUrl(r.data!.key) });
      } catch (e) {
        return fail((e as Error).message);
      }
    },
  );

  server.registerTool(
    "add_work_item",
    {
      title: "Add a work item",
      description:
        "Add a work item to one of a capsule's components, optionally assigned to someone (the same rules as the app: component owners can assign anyone; others can assign themselves). The assignee is emailed.",
      inputSchema: z.object({
        capsule: keyField,
        component: z.string().describe('The component\'s name on that capsule, like "Tech".'),
        title: z.string().min(1).max(200),
        assignee: z.string().optional().describe('A name, or "me".'),
      }),
    },
    async ({ capsule, component, title, assignee }) => {
      const data = await loadOrFail(capsule);
      if (typeof data === "string") return fail(data);
      const comp = findComponent(data, component);
      if ("error" in comp) return fail(comp.error);
      let assigneeId: string | null = null;
      if (assignee) {
        const p = findPerson(data.people, assignee, data.me.id);
        if ("error" in p) return fail(p.error!);
        assigneeId = p.id;
      }
      const position = data.items.filter((i) => i.componentId === comp.id).length;
      const r = await addWorkItem({
        orgId: data.capsule.orgId,
        capsuleId: data.capsule.id,
        componentId: comp.id,
        title,
        assigneeId,
        position,
      });
      if (!r.ok) return fail(r.error);
      return ok({ added: title, id: r.data!.id, capsule: data.capsule.key, component: comp.name });
    },
  );

  server.registerTool(
    "update_work_item",
    {
      title: "Update a work item",
      description:
        "Change a work item's status, assignee, title or notes. Get its id from get_capsule or list_my_work_items. Who may change what follows the app's rules.",
      inputSchema: z.object({
        capsule: keyField,
        work_item_id: z.string().uuid(),
        status: z.enum(ITEM_STATUSES as [ItemStatus, ...ItemStatus[]]).optional(),
        assignee: z.string().optional().describe('A name, "me", or "nobody" to unassign.'),
        title: z.string().min(1).max(200).optional(),
        note: z.string().max(5000).optional().describe("Replaces the item's notes."),
      }),
    },
    async ({ capsule, work_item_id, status, assignee, title, note }) => {
      const data = await loadOrFail(capsule);
      if (typeof data === "string") return fail(data);
      const item = data.items.find((i) => i.id === work_item_id);
      if (!item) return fail(`That work item isn't on ${data.capsule.key}.`);
      const patch: Parameters<typeof updateWorkItem>[1] = {};
      if (status) {
        // As in the app: setting a status by hand on an item with
        // collaborators stops it following their parts.
        const hasPieces = data.pieces.some((p) => p.itemId === item.id);
        patch.status = status;
        patch.done = status === "done";
        if (hasPieces) patch.status_manual = true;
      }
      if (assignee !== undefined) {
        if (["nobody", "none", "no one", "unassigned"].includes(assignee.trim().toLowerCase())) {
          patch.assignee_id = null;
        } else {
          const p = findPerson(data.people, assignee, data.me.id);
          if ("error" in p) return fail(p.error!);
          patch.assignee_id = p.id;
        }
      }
      if (title) patch.title = title;
      if (note !== undefined) patch.note = note.trim() || null;
      if (!Object.keys(patch).length) return fail("Nothing to change.");
      const r = await updateWorkItem(item.id, patch);
      if (!r.ok) return fail(r.error);
      return ok({ updated: title ?? item.title, capsule: data.capsule.key });
    },
  );

  server.registerTool(
    "add_comment",
    {
      title: "Comment on a capsule",
      description:
        'Post a comment on a capsule\'s Activity. To @mention someone, write "@" and their full name as get_capsule shows it (for example "@Dana Kim"); they are emailed. Up to 2,000 characters.',
      inputSchema: z.object({ capsule: keyField, body: z.string().min(1).max(2000) }),
    },
    async ({ capsule, body }) => {
      const data = await loadOrFail(capsule);
      if (typeof data === "string") return fail(data);
      const mentions = [
        ...new Set(
          splitMentions(body, data.people)
            .map((p) => p.mention)
            .filter((id): id is string => Boolean(id) && id !== data.me.id),
        ),
      ];
      const r = await postComment({ capsuleId: data.capsule.id, body, mentions });
      if (!r.ok) return fail(r.error);
      return ok({
        posted: true,
        capsule: data.capsule.key,
        url: await capsuleUrl(data.capsule.key),
      });
    },
  );
}
