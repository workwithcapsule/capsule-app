"use client";

import { useState } from "react";
import { CaretDown, X } from "@phosphor-icons/react";
import { Avatar } from "@/components/avatar";
import { ComponentIcon } from "@/components/component-icon";
import { PersonPicker } from "@/components/pickers";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { COMPONENT_COLOR_CLASSES } from "@/lib/design";
import type { CapsuleComponent, CapsuleData, Permissions, PersonRef } from "@/lib/capsule-types";
import { cn } from "@/lib/utils";
import { addCollaborator, removeCollaborator } from "../actions";
import { orderComponents } from "./components-section";
import type { useCapsule } from "./use-capsule";

type Change = ReturnType<typeof useCapsule>["change"];

/** Who is on each component (prototype Team section), and adding people. */
export function TeamSection({
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
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const byId = new Map(view.people.map((p) => [p.id, p]));

  const peopleOn = (k: CapsuleComponent) => {
    const ids: string[] = [];
    const add = (id: string | null) => id && !ids.includes(id) && ids.push(id);
    add(k.ownerId);
    k.collaborators.forEach((p) => add(p.userId));
    view.items.filter((i) => i.componentId === k.id).forEach((i) => add(i.assigneeId));
    return ids.map((id) => byId.get(id)).filter((p): p is PersonRef => Boolean(p));
  };

  const everyone = new Set<string>();
  if (view.capsule.ownerId) everyone.add(view.capsule.ownerId);
  ordered.forEach((k) => peopleOn(k).forEach((p) => everyone.add(p.id)));
  const canAddAnywhere = ordered.some((k) => perms.editComponent(k.id));

  return (
    <section aria-labelledby="team-h" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="team-h" className="text-base leading-6 font-semibold">
          Team <span className="font-normal text-muted-foreground">{everyone.size}</span>
        </h2>
        {canAddAnywhere && (
          <AddPerson view={view} perms={perms} change={change} components={ordered} />
        )}
      </div>
      {ordered.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-5 text-[13px] text-muted-foreground shadow-card">
          Add components to see who’s working on what.
        </p>
      ) : (
        <ul className="rounded-2xl border border-border bg-surface p-1.5 shadow-card">
          {ordered.map((k, i) => {
            const people = peopleOn(k);
            const isOpen = Boolean(open[k.id]);
            const canManage = perms.editComponent(k.id);
            return (
              <li key={k.id} className={cn(i > 0 && "border-t border-divider")}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen((o) => ({ ...o, [k.id]: !o[k.id] }))}
                  aria-label={`${k.name}, ${k.ownerId ? `owned by ${byId.get(k.ownerId)?.name}` : "no owner"}, show people`}
                  className="grid min-h-11 w-full grid-cols-[1fr_auto_auto_14px] items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 text-left hover:bg-hover"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex size-[22px] flex-none items-center justify-center rounded-md",
                        COMPONENT_COLOR_CLASSES[k.color].tag,
                      )}
                    >
                      <ComponentIcon icon={k.icon} size={13} />
                    </span>
                    <span className="truncate text-[13px] font-medium">{k.name}</span>
                  </span>
                  <span className="flex items-center pl-1.5" aria-hidden="true">
                    {people.length ? (
                      people
                        .slice(0, 5)
                        .map((p) => (
                          <Avatar
                            key={p.id}
                            name={p.name}
                            initials={p.initials}
                            size={24}
                            className="-ml-1.5 shadow-[0_0_0_2px_var(--surface)] first:ml-0"
                          />
                        ))
                    ) : (
                      <span className="size-6 rounded-full border-[1.5px] border-dashed border-dash" />
                    )}
                  </span>
                  <span className="text-xs whitespace-nowrap text-faint">
                    {k.ownerId ? "" : "No owner"}
                  </span>
                  <CaretDown
                    size={12}
                    className={cn(
                      "text-muted-foreground transition-transform",
                      isOpen && "rotate-180",
                    )}
                    aria-hidden="true"
                  />
                </button>
                {isOpen && (
                  <ul className="mx-1.5 mb-2 rounded-[10px] bg-bg px-2.5 py-1">
                    {people.length === 0 && (
                      <li className="flex min-h-9 items-center text-[13px] text-muted-foreground">
                        Nobody on this component yet.
                      </li>
                    )}
                    {people.map((p) => {
                      const collab = k.collaborators.find((c) => c.userId === p.id);
                      const role =
                        p.id === k.ownerId
                          ? "Owner"
                          : collab?.source === "added"
                            ? "Collaborator"
                            : "Assigned work";
                      return (
                        <li key={p.id} className="flex min-h-9 items-center gap-2.5">
                          <Avatar name={p.name} initials={p.initials} size={24} />
                          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                            {p.name}
                            {p.id === view.me.id ? " (you)" : ""}
                          </span>
                          <span className="flex-none text-xs text-muted-foreground">{role}</span>
                          {canManage && collab?.source === "added" && (
                            <button
                              type="button"
                              aria-label={`Remove ${p.name} from ${k.name}`}
                              onClick={() =>
                                change(
                                  { type: "removeCollaborator", componentId: k.id, userId: p.id },
                                  () => removeCollaborator(k.id, p.id),
                                  {
                                    message: `Removed ${p.name} from ${k.name}.`,
                                    undo: {
                                      op: {
                                        type: "addCollaborator",
                                        componentId: k.id,
                                        userId: p.id,
                                      },
                                      save: () =>
                                        addCollaborator({
                                          orgId: view.capsule.orgId,
                                          capsuleId: view.capsule.id,
                                          componentId: k.id,
                                          userId: p.id,
                                        }),
                                    },
                                  },
                                )
                              }
                              className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-subtle hover:text-foreground"
                            >
                              <X size={11} />
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** "+ Add": pick a person and a component to add them to as a collaborator. */
function AddPerson({
  view,
  perms,
  change,
  components,
}: {
  view: CapsuleData;
  perms: Permissions;
  change: Change;
  components: CapsuleComponent[];
}) {
  const allowed = components.filter((k) => perms.editComponent(k.id));
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState<string | null>(null);
  const [where, setWhere] = useState<string>(allowed[0]?.id ?? "");
  const target = allowed.find((k) => k.id === where);
  const already =
    target && (target.ownerId === who || target.collaborators.some((c) => c.userId === who));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="quiet" className="text-foreground">
          + Add
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-[280px] flex-col gap-2.5 p-3">
        <span className="text-[13px] font-semibold">Add someone to this capsule</span>
        <span className="text-xs text-muted-foreground">Person</span>
        <PersonPicker
          value={who}
          people={view.people}
          meId={view.me.id}
          emptyLabel="Choose a person"
          label="Person"
          onPick={setWho}
          className="mx-0 w-full rounded-lg border border-border px-2 py-1.5"
        />
        <span className="text-xs text-muted-foreground">Component</span>
        <div role="radiogroup" aria-label="Component" className="flex flex-wrap gap-1.5">
          {allowed.map((k) => (
            <button
              key={k.id}
              type="button"
              role="radio"
              aria-checked={k.id === where}
              onClick={() => setWhere(k.id)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs",
                k.id === where
                  ? "border-primary bg-primary"
                  : "border-border bg-bg hover:bg-subtle",
              )}
            >
              <span
                aria-hidden="true"
                className={cn("size-2 rounded-full", COMPONENT_COLOR_CLASSES[k.color].dot)}
              />
              {k.name}
            </button>
          ))}
        </div>
        {already && (
          <span className="text-xs text-muted-foreground">They’re already on {target?.name}.</span>
        )}
        <div className="flex gap-2">
          <Button
            variant="primary"
            disabled={!who || !target || Boolean(already)}
            onClick={() => {
              if (!who || !target) return;
              const name = view.people.find((p) => p.id === who)?.name;
              change(
                { type: "addCollaborator", componentId: target.id, userId: who },
                () =>
                  addCollaborator({
                    orgId: view.capsule.orgId,
                    capsuleId: view.capsule.id,
                    componentId: target.id,
                    userId: who,
                  }),
                { message: `${name} added to ${target.name}.` },
              );
              setOpen(false);
              setWho(null);
            }}
          >
            Add as collaborator
          </Button>
          <Button variant="quiet" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
