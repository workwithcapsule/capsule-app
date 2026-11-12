import { STATUS_META, type Status } from "@/lib/design";
import { fmtDate } from "@/lib/dates";

/**
 * Turns the capsule's activity log (public.events, append-only) into the
 * Activity feed. The log keeps everything; the feed shows what a reader needs:
 *
 * - Quick edits to the same field by the same person (each within a few
 *   minutes of the last) show as one entry, from the first value to the last.
 *   If it ends where it started (a change and its Undo), it isn't shown.
 * - Something added and then removed again by the same person within a few
 *   minutes (or removed and put back) isn't shown at all.
 * - A deleted comment is hidden; Undo shows it again.
 */

export type ActivityEvent = {
  id: string;
  kind: string;
  actorId: string | null;
  data: Record<string, unknown>;
  at: string; // ISO timestamp
};

export type FeedEntry = ActivityEvent & {
  /** For merged edits: the value before the first change and after the last. */
  from?: unknown;
  to?: unknown;
};

export const MERGE_WINDOW_MS = 5 * 60_000;

/** Pairs that cancel out: [the later kind]: the earlier kinds it undoes. */
const CANCELS: Record<string, string[]> = {
  component_removed: ["component_added"],
  component_restored: ["component_removed"],
  item_deleted: ["item_added"],
  item_added: ["item_deleted"],
  collaborator_removed: ["collaborator_added"],
  collaborator_added: ["collaborator_removed"],
};

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** What an entry is about: the capsule, a component, a work item or a collaborator. */
function target(e: ActivityEvent): string {
  const d = e.data;
  if (e.kind.startsWith("item_")) return `item:${str(d.item_id)}`;
  if (e.kind.startsWith("collaborator_")) return `collab:${str(d.component_id)}:${str(d.user_id)}`;
  if (e.kind.startsWith("component_")) return `component:${str(d.component_id)}`;
  return "capsule";
}

type Working = FeedEntry & { dropped?: boolean; lastAt: number; target: string };

export function buildFeed(events: ActivityEvent[]): FeedEntry[] {
  const sorted = [...events].sort((a, b) => a.at.localeCompare(b.at));
  const entries: Working[] = [];
  const chains = new Map<string, Working>();
  const lastByTarget = new Map<string, Working>();
  const commentDeleted = new Map<string, boolean>();

  for (const e of sorted) {
    const t = new Date(e.at).getTime();

    if (e.kind === "comment_deleted" || e.kind === "comment_restored") {
      commentDeleted.set(str(e.data.comment_id), e.kind === "comment_deleted");
      continue;
    }

    const tgt = target(e);

    if (e.kind.endsWith("_changed")) {
      const key = `${e.actorId}|${e.kind}|${tgt}|${str(e.data.field)}`;
      const chain = chains.get(key);
      if (chain && !chain.dropped && t - chain.lastAt <= MERGE_WINDOW_MS) {
        chain.to = e.data.to;
        chain.at = e.at;
        chain.lastAt = t;
        chain.data = { ...chain.data, ...e.data, from: chain.from, to: e.data.to };
        continue;
      }
      const entry: Working = { ...e, from: e.data.from, to: e.data.to, lastAt: t, target: tgt };
      entries.push(entry);
      chains.set(key, entry);
      continue;
    }

    const cancels = CANCELS[e.kind];
    if (cancels) {
      const key = `${e.actorId}|${tgt}`;
      const prev = lastByTarget.get(key);
      if (
        prev &&
        !prev.dropped &&
        cancels.includes(prev.kind) &&
        t - prev.lastAt <= MERGE_WINDOW_MS
      ) {
        // It never happened: drop the pair and anything this person did to
        // the same thing in between.
        for (const x of entries) {
          if (x.target === tgt && x.actorId === e.actorId && x.lastAt >= prev.lastAt) {
            x.dropped = true;
          }
        }
        lastByTarget.delete(key);
        continue;
      }
      const entry: Working = { ...e, lastAt: t, target: tgt };
      entries.push(entry);
      lastByTarget.set(key, entry);
      continue;
    }

    entries.push({ ...e, lastAt: t, target: tgt });
  }

  return entries
    .filter((x) => !x.dropped)
    .filter((x) => !(x.kind.endsWith("_changed") && same(x.from, x.to)))
    .filter((x) => !(x.kind === "comment" && commentDeleted.get(x.id)))
    .sort((a, b) => b.at.localeCompare(a.at))
    .map(({ id, kind, actorId, data, at, from, to }) => ({
      id,
      kind,
      actorId,
      data,
      at,
      from,
      to,
    }));
}

function same(a: unknown, b: unknown) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

// Sentences ------------------------------------------------------------------

export type DescribeContext = {
  meId: string;
  nameOf: (id: string) => string | undefined;
  dateType: "launch" | "due";
  today?: Date;
};

const statusLabel = (v: unknown) => STATUS_META[v as Status]?.label ?? String(v ?? "");
const quote = (v: unknown) => `“${str(v)}”`;

/** What happened, after the person's name: "moved Tech to In Review". */
export function describe(e: FeedEntry, ctx: DescribeContext): string {
  const d = e.data;
  const from = e.from ?? d.from;
  const to = e.to ?? d.to;
  const comp = str(d.component);
  const person = (v: unknown) => {
    const id = str(v);
    if (!id) return "someone";
    if (id === ctx.meId) return "you";
    return ctx.nameOf(id) ?? "someone";
  };
  const self = (v: unknown) => str(v) === e.actorId;
  const date = (v: unknown) => fmtDate(str(v), ctx.today);
  const dateWord = ctx.dateType === "due" ? "due date" : "launch date";

  switch (e.kind) {
    case "capsule_created":
      return "created this capsule";
    case "capsule_changed":
      switch (d.field) {
        case "name":
          return `renamed the capsule to ${quote(to)}`;
        case "outcome":
          return str(to) ? `changed the outcome to ${quote(to)}` : "cleared the outcome";
        case "status":
          return `moved the capsule to ${statusLabel(to)}`;
        case "launch_date":
          if (!str(to)) return `cleared the ${dateWord}`;
          if (!str(from)) return `set the ${dateWord} to ${date(to)}`;
          return `moved the ${dateWord} from ${date(from)} to ${date(to)}`;
        case "date_type":
          return to === "due"
            ? "changed the launch date to a due date"
            : "changed the due date to a launch date";
        case "owner":
          if (!str(to)) return "removed the capsule owner";
          return self(to) ? "took over as capsule owner" : `made ${person(to)} the capsule owner`;
      }
      break;
    case "component_added":
      return `added the ${comp} component`;
    case "component_removed": {
      const n = Number(d.items ?? 0);
      if (!n) return `removed the ${comp} component`;
      const items = `${n} work item${n === 1 ? "" : "s"}`;
      return d.moved_to
        ? `removed the ${comp} component and moved its ${items} to ${str(d.moved_to)}`
        : `removed the ${comp} component and its ${items}`;
    }
    case "component_restored":
      return `put back the ${comp} component`;
    case "component_changed":
      switch (d.field) {
        case "status":
          return to === "done" ? `marked ${comp} done` : `moved ${comp} to ${statusLabel(to)}`;
        case "owner":
          if (!str(to)) return `removed the owner of ${comp}`;
          return self(to) ? `took over ${comp}` : `made ${person(to)} the owner of ${comp}`;
        case "due_date":
          if (!str(to)) return `cleared the due date for ${comp}`;
          if (!str(from)) return `set ${comp}’s due date to ${date(to)}`;
          return `moved ${comp}’s due date from ${date(from)} to ${date(to)}`;
        case "goal":
          return str(to)
            ? `set the goal for ${comp}: ${quote(to)}`
            : `cleared the goal for ${comp}`;
      }
      break;
    case "item_added":
      return `added ${quote(d.title)} to ${comp}`;
    case "item_deleted":
      return `deleted ${quote(d.title)} from ${comp}`;
    case "item_changed":
      switch (d.field) {
        case "done":
          return to ? `checked off ${quote(d.title)}` : `reopened ${quote(d.title)}`;
        case "title":
          return `renamed ${quote(from)} to ${quote(to)}`;
        case "assignee":
          if (!str(to)) return `unassigned ${quote(d.title)}`;
          return self(to)
            ? `took ${quote(d.title)}`
            : `assigned ${quote(d.title)} to ${person(to)}`;
      }
      break;
    case "collaborator_added":
      return `added ${person(d.user_id)} to ${comp}`;
    case "collaborator_removed":
      return `removed ${person(d.user_id)} from ${comp}`;
    case "comment":
      return str(d.body);
  }
  return "made a change";
}

// Mentions -------------------------------------------------------------------

export type CommentPart = { text: string; mention?: string };

/**
 * Splits a comment into plain text and @mentions of the given people (by
 * their full name, longest first, so "@Dana Kim" wins over "@Dana").
 */
export function splitMentions(body: string, people: { id: string; name: string }[]): CommentPart[] {
  const names = [...people].sort((a, b) => b.name.length - a.name.length);
  const parts: CommentPart[] = [];
  let buf = "";
  let i = 0;
  while (i < body.length) {
    if (body[i] === "@" && (i === 0 || /\s|\(/.test(body[i - 1]))) {
      const rest = body.slice(i + 1);
      const hit = names.find(
        (p) =>
          rest.toLowerCase().startsWith(p.name.toLowerCase()) &&
          !/[\p{L}\p{N}]/u.test(rest.charAt(p.name.length)),
      );
      if (hit) {
        if (buf) parts.push({ text: buf });
        buf = "";
        parts.push({ text: `@${rest.slice(0, hit.name.length)}`, mention: hit.id });
        i += 1 + hit.name.length;
        continue;
      }
    }
    buf += body[i];
    i += 1;
  }
  if (buf) parts.push({ text: buf });
  return parts;
}

// The follower view -----------------------------------------------------------

/**
 * What a follower's Activity shows (design-decisions.md section 4): date
 * shifts, status changes, scope changes, finished milestones and comments.
 * Individual work items are left out.
 */
export function forFollowers(e: FeedEntry): boolean {
  switch (e.kind) {
    case "comment":
    case "capsule_created":
    case "component_added":
    case "component_removed":
    case "component_restored":
      return true;
    case "capsule_changed":
      return ["status", "launch_date", "date_type"].includes(str(e.data.field));
    case "component_changed":
      return ["status", "due_date"].includes(str(e.data.field));
  }
  return false;
}

/** The kind of change, shown under each entry in the follower view (prototype labels). */
export function kindLabel(e: FeedEntry): string {
  const field = str(e.data.field);
  if (e.kind === "comment") return "Comment";
  if (field === "launch_date" || field === "date_type" || field === "due_date")
    return "Date change";
  if (e.kind === "component_changed" && field === "status" && e.to === "done") return "Milestone";
  if (field === "status") return "Status change";
  if (e.kind.startsWith("component_") || e.kind === "capsule_created") return "Scope change";
  return "Update";
}
