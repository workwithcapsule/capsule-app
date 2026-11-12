"use client";

import { useState } from "react";
import { CalendarBlank, Check, Plus, User, X } from "@phosphor-icons/react";
import { Avatar } from "@/components/avatar";
import { EditableText } from "@/components/editable-text";
import { DateField, PersonPicker, StatusPicker } from "@/components/pickers";
import { StatusPill } from "@/components/status-pill";
import { useToast } from "@/components/toaster";
import { Button } from "@/components/ui/button";
import { COMPONENT_COLOR_CLASSES, STATUS_META, type Status } from "@/lib/design";
import { fmtDate } from "@/lib/dates";
import type { CapsuleComponent, CapsuleData, Permissions, WorkItem } from "@/lib/capsule-types";
import { cn } from "@/lib/utils";
import { addWorkItem, deleteWorkItem, updateComponent, updateWorkItem } from "../actions";
import type { useCapsule } from "./use-capsule";

type Change = ReturnType<typeof useCapsule>["change"];

/** Temporary ids for work items shown before the server has saved them. */
let tempSeq = 0;
const tempId = () => `temp-${++tempSeq}`;

// Status order within each group (prototype): blocked and in review first, done last.
const RANK: Record<Status, number> = {
  blocked: 0,
  in_review: 2,
  in_progress: 3,
  not_started: 4,
  done: 5,
};

/** Your components first (owner, collaborator or assignee), then the rest; each by status, then due date. */
export function orderComponents(view: CapsuleData) {
  const me = view.me.id;
  const involved = (k: CapsuleComponent) =>
    k.ownerId === me ||
    k.collaborators.some((p) => p.userId === me) ||
    view.items.some((i) => i.componentId === k.id && i.assigneeId === me);
  const sort = (a: CapsuleComponent, b: CapsuleComponent) =>
    RANK[a.status] - RANK[b.status] || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
  const mine = view.components.filter(involved).sort(sort);
  const others = view.components.filter((k) => !involved(k)).sort(sort);
  return { mine, others };
}

export function ComponentsSection({
  view,
  perms,
  change,
}: {
  view: CapsuleData;
  perms: Permissions;
  change: Change;
}) {
  const { mine, others } = orderComponents(view);
  const ordered = [...mine, ...others];
  const [selected, setSelected] = useState<string | null>(null);
  const current = ordered.find((k) => k.id === selected) ?? ordered[0] ?? null;

  return (
    <section aria-labelledby="comps-h" className="flex flex-col gap-3">
      <h2 id="comps-h" className="text-base leading-6 font-semibold">
        Components
      </h2>
      <div className="rounded-2xl border border-border bg-surface shadow-card">
        {ordered.length > 0 && (
          <div className="flex items-end gap-1 border-b border-divider px-2.5 pt-2">
            <div role="tablist" aria-label="Components" className="flex flex-wrap items-end gap-1">
              {ordered.map((k, i) => {
                const isMine = mine.includes(k);
                const on = current?.id === k.id;
                const divider = i === mine.length && mine.length > 0;
                return (
                  <span key={k.id} className="flex items-end">
                    {divider && (
                      <span
                        aria-hidden="true"
                        className="mx-1.5 mb-2.5 h-[18px] w-px self-center bg-border"
                      />
                    )}
                    <button
                      type="button"
                      role="tab"
                      id={`tab-${k.id}`}
                      aria-selected={on}
                      aria-controls="comp-panel"
                      onClick={() => setSelected(k.id)}
                      className={cn(
                        "group relative h-10 flex-none rounded-t-lg border-b-2 border-transparent px-[18px] text-[13px] font-medium whitespace-nowrap text-muted-foreground hover:text-foreground",
                        isMine && "bg-subtle",
                        on && "font-semibold text-foreground",
                      )}
                      style={on ? { borderBottomColor: `var(--${k.color}-fg)` } : undefined}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "absolute top-1/2 left-1.5 -mt-[3px] size-1.5 rounded-full opacity-0 transition-opacity group-hover:opacity-100",
                          COMPONENT_COLOR_CLASSES[k.color].dot,
                          on && "opacity-100",
                        )}
                      />
                      {k.name}
                      <span className="sr-only">
                        , {STATUS_META[k.status].label}
                        {isMine ? ", you’re on this" : ""}
                      </span>
                    </button>
                  </span>
                );
              })}
            </div>
          </div>
        )}
        {current ? (
          <ComponentPanel key={current.id} view={view} perms={perms} change={change} k={current} />
        ) : (
          <p className="p-5 text-[13px] text-muted-foreground">No components yet.</p>
        )}
      </div>
    </section>
  );
}

function ComponentPanel({
  view,
  perms,
  change,
  k,
}: {
  view: CapsuleData;
  perms: Permissions;
  change: Change;
  k: CapsuleComponent;
}) {
  const toast = useToast();
  const canEdit = perms.editComponent(k.id);
  const items = view.items.filter((i) => i.componentId === k.id);
  const done = items.filter((i) => i.done).length;
  const owner = view.people.find((p) => p.id === k.ownerId) ?? null;
  const [draft, setDraft] = useState("");

  function setComponent(
    patch: Partial<CapsuleComponent>,
    dbPatch: Parameters<typeof updateComponent>[1],
    message: string,
    before: Partial<CapsuleComponent>,
    dbBefore: Parameters<typeof updateComponent>[1],
  ) {
    change({ type: "component", id: k.id, patch }, () => updateComponent(k.id, dbPatch), {
      message,
      undo: {
        op: { type: "component", id: k.id, patch: before },
        save: () => updateComponent(k.id, dbBefore),
      },
    });
  }

  function addItem() {
    const title = draft.trim();
    if (!title) return;
    setDraft("");
    const temp: WorkItem = {
      id: tempId(),
      componentId: k.id,
      title,
      done: false,
      assigneeId: null,
      createdBy: view.me.id,
      position: items.length,
    };
    change({ type: "addItem", item: temp }, () =>
      addWorkItem({
        orgId: view.capsule.orgId,
        capsuleId: view.capsule.id,
        componentId: k.id,
        title,
        position: items.length,
      }),
    );
  }

  return (
    <article
      role="tabpanel"
      id="comp-panel"
      aria-labelledby={`tab-${k.id}`}
      className="flex flex-col"
    >
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-[18px]">
        <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-0.5">
          {canEdit ? (
            <EditableText
              value={k.goal ?? ""}
              label={`Goal for ${k.name}`}
              placeholder={`Add a goal for ${k.name}`}
              maxLength={200}
              onSave={async (goal) => {
                const r = await updateComponent(k.id, { goal: goal || null });
                if (!r.ok) toast(r.error);
                return r.ok;
              }}
              className="text-[15px] leading-[22px] font-medium"
              inputClassName="h-9"
            />
          ) : (
            k.goal && <p className="text-[15px] leading-[22px] font-medium">{k.goal}</p>
          )}
          <span className="text-[13px] leading-[18px] text-muted-foreground">
            {items.length ? `${done} of ${items.length} work items done` : "No work items yet"}
          </span>
        </div>
        <span className="flex items-center gap-1.5">
          {canEdit ? (
            <StatusPicker
              value={k.status}
              label={`Status of ${k.name}`}
              onPick={(status) =>
                setComponent(
                  { status },
                  { status },
                  `${k.name} is ${STATUS_META[status].label.toLowerCase()}.`,
                  { status: k.status },
                  { status: k.status },
                )
              }
            />
          ) : (
            <StatusPill status={k.status} />
          )}
        </span>
        <span
          className="flex min-h-8 items-center gap-1.5 text-muted-foreground"
          title="Component owner"
        >
          <User size={14} aria-hidden="true" />
          {canEdit ? (
            <PersonPicker
              value={k.ownerId}
              people={view.people}
              meId={view.me.id}
              emptyLabel="No owner"
              label={`Owner of ${k.name}`}
              onPick={(ownerId) =>
                setComponent(
                  { ownerId },
                  { owner_id: ownerId },
                  ownerId
                    ? `${view.people.find((p) => p.id === ownerId)?.name} owns ${k.name} now.`
                    : `${k.name} has no owner now.`,
                  { ownerId: k.ownerId },
                  { owner_id: k.ownerId },
                )
              }
            />
          ) : (
            <span className="text-[13px] font-medium text-foreground">
              {owner?.name ?? <span className="text-faint">No owner</span>}
            </span>
          )}
        </span>
        <span className="flex min-h-8 items-center gap-1.5 text-muted-foreground" title="Due date">
          <CalendarBlank size={14} aria-hidden="true" />
          {canEdit ? (
            <DateField
              value={k.dueDate}
              label={`Due date for ${k.name}`}
              className="text-foreground"
              onPick={(dueDate) =>
                setComponent(
                  { dueDate },
                  { due_date: dueDate },
                  dueDate
                    ? `${k.name} is due ${fmtDate(dueDate)}.`
                    : `${k.name} has no due date now.`,
                  { dueDate: k.dueDate },
                  { due_date: k.dueDate },
                )
              }
            />
          ) : (
            <span className="text-[13px] font-medium text-foreground">
              {k.dueDate ? fmtDate(k.dueDate) : <span className="text-faint">No date</span>}
            </span>
          )}
        </span>
      </div>

      <div className="px-5 pb-5">
        {items.length ? (
          <ul className="border-t border-divider">
            {items.map((item) => (
              <WorkItemRow
                key={item.id}
                item={item}
                view={view}
                perms={perms}
                change={change}
                componentName={k.name}
              />
            ))}
          </ul>
        ) : (
          <p className="border-t border-divider pt-4 pb-1 text-muted-foreground">
            {perms.onTeam
              ? "Nothing here yet. Add the first work item below."
              : "No work items yet."}
          </p>
        )}
        {perms.onTeam && (
          <div className="mt-3 flex h-10 items-center gap-1.5 rounded-xl border border-dashed border-border pr-1.5 pl-2.5 text-muted-foreground focus-within:border-solid focus-within:border-control">
            <Plus size={14} aria-hidden="true" />
            <label htmlFor={`add-${k.id}`} className="sr-only">
              Add a work item to {k.name}
            </label>
            <input
              id={`add-${k.id}`}
              value={draft}
              placeholder="Add a work item"
              autoComplete="off"
              maxLength={500}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addItem();
                }
              }}
              className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-faint focus-visible:outline-none"
            />
            <Button
              variant={draft.trim() ? "primary" : "secondary"}
              className="h-7 px-3"
              disabled={!draft.trim()}
              onClick={addItem}
            >
              Add
            </Button>
          </div>
        )}
      </div>
    </article>
  );
}

function WorkItemRow({
  item,
  view,
  perms,
  change,
  componentName,
}: {
  item: WorkItem;
  view: CapsuleData;
  perms: Permissions;
  change: Change;
  componentName: string;
}) {
  const toast = useToast();
  const temp = item.id.startsWith("temp-");
  const canComplete = !temp && perms.completeItem(item);
  const canRename = !temp && perms.renameItem(item);
  const canDelete = !temp && perms.deleteItem(item);
  const assign = temp ? "none" : perms.assignOptions(item);
  const assignee = view.people.find((p) => p.id === item.assigneeId) ?? null;
  const strike = item.done ? "text-faint line-through" : "";

  function toggle() {
    const next = !item.done;
    change(
      { type: "item", id: item.id, patch: { done: next } },
      () => updateWorkItem(item.id, { done: next }),
      {
        message: next ? `Checked off “${item.title}”.` : `“${item.title}” is open again.`,
        undo: {
          op: { type: "item", id: item.id, patch: { done: !next } },
          save: () => updateWorkItem(item.id, { done: !next }),
        },
      },
    );
  }

  function reassign(assigneeId: string | null) {
    const name = view.people.find((p) => p.id === assigneeId)?.name;
    change(
      { type: "item", id: item.id, patch: { assigneeId } },
      () => updateWorkItem(item.id, { assignee_id: assigneeId }),
      {
        message: assigneeId
          ? `Assigned to ${assigneeId === view.me.id ? "you" : name}.`
          : "Unassigned.",
        undo: {
          op: { type: "item", id: item.id, patch: { assigneeId: item.assigneeId } },
          save: () => updateWorkItem(item.id, { assignee_id: item.assigneeId }),
        },
      },
    );
  }

  function remove() {
    change({ type: "removeItem", id: item.id }, () => deleteWorkItem(item.id), {
      message: `Deleted “${item.title}” from ${componentName}.`,
      undo: {
        op: { type: "addItem", item: { ...item, id: tempId() } },
        save: () =>
          addWorkItem({
            orgId: view.capsule.orgId,
            capsuleId: view.capsule.id,
            componentId: item.componentId,
            title: item.title,
            assigneeId: item.assigneeId,
            done: item.done,
            position: item.position,
          }),
      },
    });
  }

  return (
    <li className="group -mx-2 flex min-h-12 items-center gap-3 rounded-lg border-b border-divider px-2 py-1.5 hover:bg-hover">
      {canComplete ? (
        <input
          type="checkbox"
          id={`wi-${item.id}`}
          checked={item.done}
          onChange={toggle}
          aria-label={`${item.done ? "Reopen" : "Check off"} ${item.title}`}
          className="size-[18px] flex-none accent-[#A39A94]"
        />
      ) : (
        <span
          aria-hidden="true"
          title="Only the assignee or an owner can check this off"
          className="flex size-[18px] flex-none items-center justify-center rounded-[5px] border-[1.5px] border-dash bg-subtle text-muted-foreground"
        >
          {item.done && <Check size={12} weight="bold" />}
        </span>
      )}
      <span className={cn("min-w-0 flex-1", strike)}>
        {canRename ? (
          <EditableText
            value={item.title}
            label="Work item"
            required
            maxLength={500}
            onSave={async (title) => {
              const r = await updateWorkItem(item.id, { title });
              if (!r.ok) toast(r.error);
              return r.ok;
            }}
            className={strike}
            inputClassName="h-8"
          />
        ) : (
          <>
            {item.title}
            <span className="sr-only">{item.done ? " (done)" : " (not done)"}</span>
          </>
        )}
      </span>
      <span className="flex min-w-28 flex-none items-center gap-1.5 text-[13px] text-muted-foreground">
        {assign === "none" ? (
          assignee ? (
            <>
              <Avatar name={assignee.name} initials={assignee.initials} />
              {assignee.id === view.me.id ? "You" : assignee.name}
            </>
          ) : (
            <>
              <span
                aria-hidden="true"
                className="size-[22px] flex-none rounded-full border border-dashed border-dash"
              />
              Unassigned
            </>
          )
        ) : (
          <PersonPicker
            value={item.assigneeId}
            people={
              assign === "anyone" ? view.people : view.people.filter((p) => p.id === view.me.id)
            }
            meId={view.me.id}
            emptyLabel="Unassigned"
            label={`Assignee for ${item.title}`}
            onPick={reassign}
            className="font-normal text-muted-foreground"
          />
        )}
      </span>
      {canDelete ? (
        <button
          type="button"
          aria-label={`Delete ${item.title}`}
          title="Delete"
          onClick={remove}
          className="inline-flex size-7 flex-none items-center justify-center rounded-full text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-subtle hover:text-foreground focus-visible:opacity-100"
        >
          <X size={12} />
        </button>
      ) : (
        <span className="w-7 flex-none" aria-hidden="true" />
      )}
    </li>
  );
}
