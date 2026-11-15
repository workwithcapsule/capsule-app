import "server-only";
import { after } from "next/server";
import { fmtDate } from "@/lib/dates";
import {
  addedToCapsuleEmail,
  assignedEmail,
  mentionEmail,
  pieceEmail,
  ownerOfCapsuleEmail,
  ownerOfComponentEmail,
  type Email,
} from "@/lib/email/notifications";
import { sendEmail } from "@/lib/email/send";
import { siteOrigin } from "@/lib/site";
import { createAdminClient } from "@/lib/supabase/admin";

/*
 * Notification emails (step 11, build-decisions.md 47–48).
 *
 * The change is saved first; the email is sent about 20 seconds later from
 * the same request (after the response), and only if it's still true then,
 * so Undo cancels it. Nobody is emailed about their own actions, and people
 * who turned emails off in Settings aren't emailed. Test mode
 * (lib/email/send.ts) still limits who can receive anything.
 *
 * The server's secret key is used to look up the recipient's address and
 * the current state; it never leaves the server.
 */

export type NotifyJob =
  | { kind: "component_owner"; componentId: string; ownerId: string }
  | { kind: "capsule_owner"; capsuleId: string; ownerId: string }
  | { kind: "assigned"; itemId: string; assigneeId: string }
  | { kind: "piece"; pieceId: string; userId: string }
  | { kind: "mention"; commentId: string }
  | { kind: "new_capsule"; capsuleId: string };

const delayMs = () => Number(process.env.NOTIFY_DELAY_MS ?? 20_000);

/** Schedules a notification check for after the response is sent. */
export async function notifyLater(actorId: string | undefined, job: NotifyJob) {
  if (!actorId) return;
  const origin = await siteOrigin();
  const at = Date.now();
  after(async () => {
    await new Promise((r) => setTimeout(r, delayMs()));
    try {
      await deliver(actorId, job, origin, at);
    } catch (e) {
      console.error("[notify] couldn't send", job.kind, e);
    }
  });
}

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;
type Person = { id: string; name: string; email: string; on: boolean };

async function people(admin: Admin, ids: string[]): Promise<Map<string, Person>> {
  const { data } = await admin
    .from("users")
    .select("id, name, email, email_notifications")
    .in("id", ids);
  return new Map(
    (data ?? []).map((u) => [
      u.id,
      {
        id: u.id,
        name: (u.name as string | null)?.trim() || (u.email as string),
        email: u.email as string,
        on: u.email_notifications !== false,
      },
    ]),
  );
}

async function capsuleInfo(admin: Admin, capsuleId: string) {
  const { data } = await admin
    .from("capsules")
    .select("id, name, number, owner_id, archived_at, spaces(key_prefix)")
    .eq("id", capsuleId)
    .maybeSingle();
  if (!data || data.archived_at) return null;
  const prefix = (data.spaces as unknown as { key_prefix: string } | null)?.key_prefix ?? "";
  return {
    id: data.id,
    name: data.name as string,
    key: `${prefix}-${data.number}`,
    ownerId: data.owner_id,
  };
}

async function send(
  admin: Admin,
  actorId: string,
  recipientId: string,
  build: (actor: string) => Email,
) {
  if (recipientId === actorId) return;
  const map = await people(admin, [actorId, recipientId]);
  const to = map.get(recipientId);
  if (!to || !to.on) return;
  const actor = map.get(actorId)?.name ?? "Someone";
  const r = await sendEmail({ to: to.email, ...build(actor) });
  if (r.status === "failed") console.error("[notify] email failed:", r.error);
}

/**
 * True when this change only put things back the way they were: the first
 * of the recent changes to this field started from the same person (an Undo,
 * or a quick change and change back). Those don't get an email.
 */
async function backToBefore(
  admin: Admin,
  where: { kind: string; capsuleId?: string; key?: [string, string] },
  field: string,
  personId: string,
  at: number,
) {
  let q = admin
    .from("events")
    .select("data, created_at")
    .eq("kind", where.kind)
    .eq("data->>field", field)
    .gte("created_at", new Date(at - 5 * 60_000).toISOString())
    .order("created_at", { ascending: true })
    .limit(1);
  if (where.capsuleId) q = q.eq("capsule_id", where.capsuleId);
  if (where.key) q = q.eq(`data->>${where.key[0]}`, where.key[1]);
  const { data } = await q;
  const first = data?.[0]?.data as { from?: unknown } | undefined;
  return first?.from === personId;
}

async function deliver(actorId: string, job: NotifyJob, origin: string, at: number) {
  const admin = createAdminClient();
  if (!admin) return;
  const settingsUrl = `${origin}/settings`;
  const capsuleUrl = (key: string) => `${origin}/capsules/${key.toLowerCase()}`;

  switch (job.kind) {
    case "component_owner": {
      const { data: k } = await admin
        .from("components")
        .select("id, capsule_id, owner_id, due_date, component_types(name)")
        .eq("id", job.componentId)
        .maybeSingle();
      if (!k || k.owner_id !== job.ownerId) return; // undone or changed since
      if (
        await backToBefore(
          admin,
          { kind: "component_changed", key: ["component_id", k.id] },
          "owner",
          job.ownerId,
          at,
        )
      )
        return;
      const cap = await capsuleInfo(admin, k.capsule_id);
      if (!cap) return;
      const component =
        (k.component_types as unknown as { name: string } | null)?.name ?? "A component";
      await send(admin, actorId, job.ownerId, (actor) =>
        ownerOfComponentEmail({
          actor,
          component,
          dueDate: k.due_date ? fmtDate(k.due_date) : null,
          capsuleKey: cap.key,
          capsuleName: cap.name,
          url: `${capsuleUrl(cap.key)}?component=${k.id}`,
          settingsUrl,
        }),
      );
      return;
    }
    case "capsule_owner": {
      const cap = await capsuleInfo(admin, job.capsuleId);
      if (!cap || cap.ownerId !== job.ownerId) return;
      if (
        await backToBefore(
          admin,
          { kind: "capsule_changed", capsuleId: cap.id },
          "owner",
          job.ownerId,
          at,
        )
      )
        return;
      await send(admin, actorId, job.ownerId, (actor) =>
        ownerOfCapsuleEmail({
          actor,
          capsuleKey: cap.key,
          capsuleName: cap.name,
          url: capsuleUrl(cap.key),
          settingsUrl,
        }),
      );
      return;
    }
    case "assigned": {
      const { data: w } = await admin
        .from("work_items")
        .select("id, title, done, assignee_id, capsule_id, components(component_types(name))")
        .eq("id", job.itemId)
        .maybeSingle();
      if (!w || w.assignee_id !== job.assigneeId || w.done) return;
      if (
        await backToBefore(
          admin,
          { kind: "item_changed", key: ["item_id", w.id] },
          "assignee",
          job.assigneeId,
          at,
        )
      )
        return;
      const cap = await capsuleInfo(admin, w.capsule_id);
      if (!cap) return;
      const component =
        (w.components as unknown as { component_types: { name: string } | null } | null)
          ?.component_types?.name ?? "a component";
      await send(admin, actorId, job.assigneeId, (actor) =>
        assignedEmail({
          actor,
          title: w.title,
          component,
          capsuleKey: cap.key,
          capsuleName: cap.name,
          url: `${capsuleUrl(cap.key)}?item=${w.id}`,
          settingsUrl,
        }),
      );
      return;
    }
    case "piece": {
      const { data: p } = await admin
        .from("work_item_collaborators")
        .select(
          "id, user_id, piece, status, is_lead, work_items(id, title, done, capsule_id, components(component_types(name)))",
        )
        .eq("id", job.pieceId)
        .maybeSingle();
      // Removed since (an Undo), finished already, or the item is done.
      const w = p?.work_items as unknown as {
        id: string;
        title: string;
        done: boolean;
        capsule_id: string;
        components: { component_types: { name: string } | null } | null;
      } | null;
      if (!p || !w || p.user_id !== job.userId || p.status === "done" || w.done) return;
      const cap = await capsuleInfo(admin, w.capsule_id);
      if (!cap) return;
      await send(admin, actorId, job.userId, (actor) =>
        pieceEmail({
          actor,
          title: w.title,
          component: w.components?.component_types?.name ?? "a component",
          piece: p.piece,
          lead: p.is_lead,
          capsuleKey: cap.key,
          capsuleName: cap.name,
          url: `${capsuleUrl(cap.key)}?item=${w.id}&open=1`,
          settingsUrl,
        }),
      );
      return;
    }
    case "mention": {
      const { data: e } = await admin
        .from("events")
        .select("id, capsule_id, data")
        .eq("id", job.commentId)
        .eq("kind", "comment")
        .maybeSingle();
      if (!e) return;
      // Deleted since (and not put back)? Then nobody is emailed.
      const { data: marks } = await admin
        .from("events")
        .select("kind, created_at")
        .eq("capsule_id", e.capsule_id)
        .in("kind", ["comment_deleted", "comment_restored"])
        .eq("data->>comment_id", e.id)
        .order("created_at", { ascending: false })
        .limit(1);
      if (marks?.[0]?.kind === "comment_deleted") return;
      const cap = await capsuleInfo(admin, e.capsule_id);
      if (!cap) return;
      const { data: mentions } = await admin
        .from("mentions")
        .select("user_id")
        .eq("event_id", e.id);
      const body = String((e.data as { body?: string } | null)?.body ?? "");
      for (const m of mentions ?? []) {
        await send(admin, actorId, m.user_id, (actor) =>
          mentionEmail({
            actor,
            body,
            capsuleKey: cap.key,
            capsuleName: cap.name,
            url: `${capsuleUrl(cap.key)}?activity=1`,
            settingsUrl,
          }),
        );
      }
      return;
    }
    case "new_capsule": {
      const cap = await capsuleInfo(admin, job.capsuleId);
      if (!cap) return;
      const [{ data: comps }, { data: items }] = await Promise.all([
        admin
          .from("components")
          .select("owner_id, component_types(name)")
          .eq("capsule_id", cap.id)
          .order("position"),
        admin
          .from("work_items")
          .select("title, assignee_id, done")
          .eq("capsule_id", cap.id)
          .order("position"),
      ]);
      const who = new Map<string, { ownsCapsule: boolean; owns: string[]; items: string[] }>();
      const get = (id: string) => {
        if (!who.has(id)) who.set(id, { ownsCapsule: false, owns: [], items: [] });
        return who.get(id)!;
      };
      if (cap.ownerId) get(cap.ownerId).ownsCapsule = true;
      for (const k of comps ?? []) {
        const name = (k.component_types as unknown as { name: string } | null)?.name;
        if (k.owner_id && name) get(k.owner_id).owns.push(name);
      }
      for (const w of items ?? [])
        if (w.assignee_id && !w.done) get(w.assignee_id).items.push(w.title);
      for (const [id, what] of who) {
        await send(admin, actorId, id, (actor) =>
          addedToCapsuleEmail({
            actor,
            ...what,
            capsuleKey: cap.key,
            capsuleName: cap.name,
            url: capsuleUrl(cap.key),
            settingsUrl,
          }),
        );
      }
      return;
    }
  }
}
