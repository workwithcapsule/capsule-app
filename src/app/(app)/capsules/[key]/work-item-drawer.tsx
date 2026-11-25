"use client";

import { useState } from "react";
import { Crown, DotsThree, Plus, SignOut, User, UserMinus, X } from "@phosphor-icons/react";
import { Avatar } from "@/components/avatar";
import { ComponentIcon } from "@/components/component-icon";
import { EditableText } from "@/components/editable-text";
import { PersonPicker, StatusPicker } from "@/components/pickers";
import { StatusPill } from "@/components/status-pill";
import { useToast } from "@/components/toaster";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { buildFeed } from "@/lib/activity";
import type { CapsuleData, Permissions, Piece, WorkItem } from "@/lib/capsule-types";
import { COMPONENT_COLOR_CLASSES, STATUS_META } from "@/lib/design";
import { cn } from "@/lib/utils";
import { fmtRelative } from "@/lib/dates";
import { JiraTag } from "./jira-link";
import {
  ITEM_STATUSES,
  piecesDone,
  suggestStatus,
  withStatus,
  type ItemStatus,
} from "@/lib/work-items";
import { addPiece, removePiece, updatePiece, updateWorkItem } from "../actions";
import { ActivityRow } from "./activity-section";
import type { useCapsule } from "./use-capsule";
import { track } from "@/lib/analytics";

type Change = ReturnType<typeof useCapsule>["change"];

let tempSeq = 0;
const tempId = () => `temp-piece-${++tempSeq}`;

/**
 * Changes to one work item, shared by its row in the list and its drawer:
 * check off, status, assignee. Each shows at once and offers Undo.
 */
export function useItemActions(item: WorkItem, view: CapsuleData, change: Change) {
  const hasPieces = view.pieces.some((p) => p.itemId === item.id);
  const before = { status: item.status, done: item.done, statusManual: item.statusManual };

  function undoStatus() {
    return {
      op: { type: "item" as const, id: item.id, patch: before },
      save: () =>
        updateWorkItem(item.id, { status: item.status, status_manual: item.statusManual }),
    };
  }

  return {
    toggle() {
      const next = !item.done;
      const status: ItemStatus = next ? "done" : "not_started";
      change(
        { type: "item", id: item.id, patch: withStatus(before, status, hasPieces) },
        async () => {
          const r = await updateWorkItem(item.id, { done: next });
          if (r.ok) track("work_item_completion_changed", { completed: next });
          return r;
        },
        {
          message: next ? `Checked off “${item.title}”.` : `“${item.title}” is open again.`,
          undo: undoStatus(),
        },
      );
    },
    setStatus(status: ItemStatus) {
      change(
        { type: "item", id: item.id, patch: withStatus(before, status, hasPieces) },
        () => updateWorkItem(item.id, { status }),
        {
          message: `“${item.title}” is ${STATUS_META[status].label.toLowerCase()}.`,
          undo: undoStatus(),
        },
      );
    },
    useSuggestion() {
      const s = suggestStatus(view.pieces.filter((p) => p.itemId === item.id));
      if (!s) return;
      change(
        {
          type: "item",
          id: item.id,
          patch: { status: s, done: s === "done", statusManual: false },
        },
        () => updateWorkItem(item.id, { status_manual: false }),
        {
          message: `“${item.title}” follows its pieces again.`,
          undo: undoStatus(),
        },
      );
    },
    reassign(assigneeId: string | null) {
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
    },
  };
}

/**
 * The work item detail view (step 12): a drawer over the capsule page, like
 * the prototype's drawer. Title, status, assignee, notes, the people on it
 * with their piece and status, and the item's own Activity.
 */
export function WorkItemDrawer({
  item,
  view,
  perms,
  change,
  onClose,
}: {
  item: WorkItem | null;
  view: CapsuleData;
  perms: Permissions;
  change: Change;
  onClose: () => void;
}) {
  return (
    <Sheet open={!!item} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        aria-describedby={undefined}
        // Undo in a toast shouldn't close the drawer.
        // Open on the panel itself, not with the title already in edit focus.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement | null)?.focus();
        }}
        onInteractOutside={(e) => {
          if ((e.target as Element | null)?.closest?.("[aria-live]")) e.preventDefault();
        }}
      >
        {item && (
          <DrawerBody
            key={item.id}
            item={item}
            view={view}
            perms={perms}
            change={change}
            onClose={onClose}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function DrawerBody({
  item,
  view,
  perms,
  change,
  onClose,
}: {
  item: WorkItem;
  view: CapsuleData;
  perms: Permissions;
  change: Change;
  onClose: () => void;
}) {
  const toast = useToast();
  const actions = useItemActions(item, view, change);
  const k = view.components.find((c) => c.id === item.componentId);
  const pieces = view.pieces.filter((p) => p.itemId === item.id);
  const suggested = suggestStatus(pieces);
  const canComplete = perms.completeItem(item);
  const canRename = perms.renameItem(item);
  const canManage = perms.manageItem(item);
  const assign = perms.assignOptions(item);
  const assignee = view.people.find((p) => p.id === item.assigneeId) ?? null;
  const onIt = new Set(pieces.map((p) => p.userId));
  const addable = view.people.filter((p) => !onIt.has(p.id));
  const feed = buildFeed(view.activity.filter((e) => e.data.item_id === item.id));

  function add(userId: string) {
    const temp: Piece = {
      id: tempId(),
      itemId: item.id,
      userId,
      piece: "",
      status: "not_started",
      isLead: false,
      createdBy: view.me.id,
    };
    const name = view.people.find((p) => p.id === userId)?.name ?? "them";
    change(
      { type: "addPiece", piece: temp },
      () =>
        addPiece({
          orgId: view.capsule.orgId,
          capsuleId: view.capsule.id,
          itemId: item.id,
          piece: { userId, piece: "", status: "not_started", isLead: false },
        }),
      {
        message: `Added ${userId === view.me.id ? "you" : name} to “${item.title}”.`,
        undo: (data) => ({
          op: { type: "removePiece", id: temp.id },
          save: () => removePiece(data!.id),
        }),
      },
    );
  }

  return (
    <>
      <div className="flex items-start gap-3.5 border-b border-divider px-5 pt-5 pb-4 laptop:pl-6">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium">Work item</span>
            {k && (
              <>
                <span aria-hidden="true">·</span>
                <span
                  className={cn(
                    "inline-flex h-5 flex-none items-center gap-1 rounded-md pr-[7px] pl-1.5 font-medium whitespace-nowrap",
                    COMPONENT_COLOR_CLASSES[k.color].tag,
                  )}
                >
                  <ComponentIcon icon={k.icon} size={12} aria-hidden="true" />
                  {k.name}
                </span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span className="font-mono">{view.capsule.key}</span>
            {item.link && <JiraTag link={item.link} />}
          </div>
          <SheetTitle asChild>
            <h2 className="m-0 text-xl leading-7 font-semibold tracking-[-0.01em]">
              {canRename ? (
                <EditableText
                  value={item.title}
                  label="Work item title"
                  required
                  maxLength={500}
                  multiline
                  onSave={async (title) => {
                    const r = await updateWorkItem(item.id, { title });
                    if (!r.ok) toast(r.error);
                    return r.ok;
                  }}
                />
              ) : (
                item.title
              )}
            </h2>
          </SheetTitle>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close work item"
          className="inline-flex size-9 flex-none items-center justify-center rounded-full text-muted-foreground hover:bg-subtle hover:text-foreground"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-5 py-5 laptop:px-6">
        <dl className="grid grid-cols-[96px_1fr] items-center gap-x-4 gap-y-3 text-[13px]">
          <dt className="text-muted-foreground">Status</dt>
          <dd className="m-0 flex flex-col items-start gap-1">
            {canComplete ? (
              <StatusPicker
                value={item.status}
                options={ITEM_STATUSES}
                label={`Status of ${item.title}`}
                onPick={actions.setStatus}
              />
            ) : (
              <StatusPill status={item.status} />
            )}
            {!item.link && suggested && item.statusManual && suggested !== item.status && (
              <span className="text-xs text-muted-foreground">
                Suggested from the pieces: {STATUS_META[suggested].label}
                {canComplete && (
                  <>
                    {" · "}
                    <button
                      type="button"
                      onClick={actions.useSuggestion}
                      className="font-medium text-foreground hover:underline"
                    >
                      Use suggestion
                    </button>
                  </>
                )}
              </span>
            )}
            {item.link ? (
              <span className="text-xs text-muted-foreground" suppressHydrationWarning>
                Follows Jira{item.link.statusName ? ` (${item.link.statusName})` : ""}
                {item.link.syncedAt &&
                  ` · checked ${fmtRelative(item.link.syncedAt).toLowerCase()}`}
              </span>
            ) : (
              suggested &&
              !item.statusManual && (
                <span className="text-xs text-muted-foreground">Follows the pieces below</span>
              )
            )}
          </dd>
          <dt className="text-muted-foreground">Assignee</dt>
          <dd className="m-0 flex min-h-8 items-center gap-1.5">
            {assign === "none" ? (
              assignee ? (
                <>
                  <Avatar name={assignee.name} initials={assignee.initials} />
                  <span className="font-medium">
                    {assignee.id === view.me.id ? "You" : assignee.name}
                  </span>
                </>
              ) : item.link?.assigneeName ? (
                <span title="Assigned in Jira; not in Capsule">
                  {item.link.assigneeName} <span className="text-faint">(in Jira)</span>
                </span>
              ) : (
                <span className="text-faint">Unassigned</span>
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
                onPick={actions.reassign}
              />
            )}
          </dd>
        </dl>

        <section aria-labelledby="wi-notes-h" className="flex flex-col gap-2">
          <h3 id="wi-notes-h" className="m-0 text-[13px] font-semibold">
            Notes
          </h3>
          {canRename ? (
            <Notes item={item} />
          ) : item.note ? (
            <p className="m-0 text-sm whitespace-pre-wrap">{item.note}</p>
          ) : (
            <p className="m-0 text-[13px] text-faint">No notes.</p>
          )}
        </section>

        <section aria-labelledby="wi-people-h" className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <h3 id="wi-people-h" className="m-0 text-[13px] font-semibold">
              Collaborators{" "}
              {pieces.length > 0 && (
                <span className="font-normal text-muted-foreground">{piecesDone(pieces)}</span>
              )}
            </h3>
          </div>
          {pieces.length > 0 ? (
            <ul className="m-0 flex list-none flex-col rounded-xl border border-border p-0">
              {pieces.map((p) => (
                <PieceRow key={p.id} p={p} item={item} view={view} perms={perms} change={change} />
              ))}
            </ul>
          ) : (
            <p className="m-0 text-[13px] text-muted-foreground">
              {canManage
                ? "Working on this with others? Add them, and each can track their own part."
                : "Nobody else is on this yet."}
            </p>
          )}
          {canManage && addable.length > 0 && (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger className="inline-flex h-8 items-center gap-1.5 self-start rounded-full pr-3 pl-2 text-[13px] font-medium text-muted-foreground hover:bg-subtle hover:text-foreground">
                <Plus size={14} />
                Add collaborator
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="max-h-[320px] w-[260px] overflow-y-auto"
              >
                <DropdownMenuLabel>Add to “{item.title}”</DropdownMenuLabel>
                {addable.map((person) => (
                  <DropdownMenuItem key={person.id} onSelect={() => add(person.id)}>
                    <Avatar name={person.name} initials={person.initials} />
                    <span className="truncate">
                      {person.id === view.me.id ? `${person.name} (you)` : person.name}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </section>

        <section aria-labelledby="wi-activity-h" className="flex flex-col gap-1">
          <h3 id="wi-activity-h" className="m-0 text-[13px] font-semibold">
            Activity
          </h3>
          {feed.length ? (
            <ul className="m-0 list-none p-0">
              {feed.map((e) => (
                <ActivityRow
                  key={e.id}
                  e={e}
                  view={view}
                  team={[]}
                  big={false}
                  onDelete={() => {}}
                />
              ))}
            </ul>
          ) : (
            <p className="m-0 text-[13px] text-muted-foreground">
              Changes to this work item will show up here.
            </p>
          )}
        </section>
      </div>
    </>
  );
}

/** Notes save when you click away (or press ⌘Enter), like the prototype's text areas. */
function Notes({ item }: { item: WorkItem }) {
  const toast = useToast();
  const [draft, setDraft] = useState(item.note ?? "");
  const [saved, setSaved] = useState(item.note ?? "");

  async function save() {
    if (draft === saved) return;
    const r = await updateWorkItem(item.id, { note: draft.trim() ? draft : null });
    if (!r.ok) return toast(r.error);
    setSaved(draft);
    toast("Notes saved.");
  }

  return (
    <>
      <label htmlFor={`note-${item.id}`} className="sr-only">
        Notes for {item.title}
      </label>
      <textarea
        id={`note-${item.id}`}
        value={draft}
        rows={4}
        maxLength={5000}
        placeholder="Add details, links or decisions"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void save();
          }
        }}
        className="min-h-24 w-full resize-y rounded-[10px] border border-border bg-surface px-3 py-2.5 text-sm leading-[22px] outline-none placeholder:text-faint hover:border-border-strong focus-visible:border-control"
      />
    </>
  );
}

function PieceRow({
  p,
  item,
  view,
  perms,
  change,
}: {
  p: Piece;
  item: WorkItem;
  view: CapsuleData;
  perms: Permissions;
  change: Change;
}) {
  const toast = useToast();
  const person = view.people.find((x) => x.id === p.userId);
  const name = person?.name ?? "Someone";
  const isMe = p.userId === view.me.id;
  const temp = p.id.startsWith("temp-");
  const canEdit = !temp && perms.editPiece(p, item);
  const canManage = !temp && perms.manageItem(item);
  const who = isMe ? "your" : `${name}’s`;

  function setPiece(patch: Partial<Piece>, db: Parameters<typeof updatePiece>[1], message: string) {
    const before: Partial<Piece> = {};
    const dbBefore: Parameters<typeof updatePiece>[1] = {};
    if ("status" in patch) {
      before.status = p.status;
      dbBefore.status = p.status;
    }
    if ("isLead" in patch) {
      before.isLead = p.isLead;
      dbBefore.is_lead = p.isLead;
    }
    change({ type: "piece", id: p.id, patch }, () => updatePiece(p.id, db), {
      message,
      undo: {
        op: { type: "piece", id: p.id, patch: before },
        save: () => updatePiece(p.id, dbBefore),
      },
    });
  }

  function remove() {
    change({ type: "removePiece", id: p.id }, () => removePiece(p.id), {
      message: isMe ? `You left “${item.title}”.` : `Removed ${name} from “${item.title}”.`,
      undo: {
        op: { type: "addPiece", piece: p },
        save: () =>
          addPiece({
            orgId: view.capsule.orgId,
            capsuleId: view.capsule.id,
            itemId: item.id,
            piece: {
              id: p.id,
              userId: p.userId,
              piece: p.piece,
              status: p.status,
              isLead: p.isLead,
            },
          }),
      },
    });
  }

  return (
    <li className="flex items-center gap-3 border-b border-divider px-3 py-2.5 last:border-b-0">
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <Avatar name={name} initials={person?.initials ?? "?"} size={24} me={isMe} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5 text-[13px] font-medium">
            <span className="truncate">{isMe ? `${name} (you)` : name}</span>
            {p.isLead && (
              <span className="inline-flex h-[18px] items-center gap-1 rounded-full bg-subtle px-1.5 text-[11px] font-medium text-muted-foreground">
                <Crown size={10} aria-hidden="true" />
                Lead
              </span>
            )}
          </span>
          {canEdit ? (
            <EditableText
              value={p.piece}
              label={`${isMe ? "Your" : `${name}’s`} part`}
              placeholder="Add their part"
              maxLength={80}
              onSave={async (piece) => {
                const r = await updatePiece(p.id, { piece });
                if (!r.ok) toast(r.error);
                return r.ok;
              }}
              className="text-[13px] text-muted-foreground"
              inputClassName="h-7"
            />
          ) : (
            <span className="truncate text-[13px] text-muted-foreground">
              {p.piece || <span className="text-faint">No part named</span>}
            </span>
          )}
        </span>
      </span>
      <span className="flex flex-none items-center gap-1">
        {canEdit ? (
          <StatusPicker
            value={p.status}
            options={ITEM_STATUSES}
            label={`Status of ${who} part`}
            onPick={(status) =>
              setPiece(
                { status },
                { status },
                status === "done"
                  ? `Marked ${who} part done.`
                  : `${isMe ? "Your" : `${name}’s`} part is ${STATUS_META[status].label.toLowerCase()}.`,
              )
            }
          />
        ) : (
          <StatusPill status={p.status} />
        )}
        {(canManage || (canEdit && isMe)) && (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger
              aria-label={`Options for ${name}`}
              className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-subtle hover:text-foreground"
            >
              <DotsThree size={18} weight="bold" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[200px]">
              {canManage && !p.isLead && (
                <DropdownMenuItem
                  onSelect={() =>
                    setPiece(
                      { isLead: true },
                      { is_lead: true },
                      `${isMe ? "You’re" : `${name} is`} the lead on “${item.title}”.`,
                    )
                  }
                >
                  <Crown size={16} />
                  Make lead
                </DropdownMenuItem>
              )}
              {canManage && p.isLead && (
                <DropdownMenuItem
                  onSelect={() =>
                    setPiece(
                      { isLead: false },
                      { is_lead: false },
                      `“${item.title}” has no lead now.`,
                    )
                  }
                >
                  <User size={16} />
                  Remove as lead
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={remove}>
                {isMe ? <SignOut size={16} /> : <UserMinus size={16} />}
                {isMe ? "Leave this work item" : `Remove ${name}`}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </span>
    </li>
  );
}
