"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarBlank, Plus, User, X } from "@phosphor-icons/react";
import { Avatar } from "@/components/avatar";
import { ComponentIcon } from "@/components/component-icon";
import { DateField, PersonPicker } from "@/components/pickers";
import { useToast } from "@/components/toaster";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { FieldError, Input, Label } from "@/components/ui/input";
import { COMPONENT_COLOR_CLASSES } from "@/lib/design";
import type { ComponentType, PersonRef } from "@/lib/capsule-types";
import { cn } from "@/lib/utils";
import { createCapsule } from "../capsules/actions";
import { NativeSelect } from "@/components/ui/native-select";

/*
 * "Set up your capsule" (prototype New capsule, filling in the fields).
 * Everything here is saved together when you click Create. Step 9 adds the
 * AI composer in front of this form.
 */

type DraftItem = { key: string; title: string; assigneeId: string | null };
type DraftComponent = {
  typeId: string;
  ownerId: string | null;
  dueDate: string | null;
  goal: string;
  collaborators: string[];
  items: DraftItem[];
  itemDraft: string;
};

export type SpaceOption = { id: string; name: string; keyPrefix: string; joined: boolean };

let seq = 0;
const nextKey = () => `i-${++seq}`;

export function NewCapsuleForm({
  spaces,
  people,
  types,
  me,
  defaultSpaceId,
}: {
  spaces: SpaceOption[];
  people: PersonRef[];
  types: ComponentType[];
  me: PersonRef;
  defaultSpaceId: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [outcome, setOutcome] = useState("");
  const [spaceId, setSpaceId] = useState(
    defaultSpaceId ?? spaces.find((s) => s.joined)?.id ?? spaces[0]?.id ?? "",
  );
  const [launchDate, setLaunchDate] = useState<string | null>(null);
  const [dateType, setDateType] = useState<"launch" | "due">("launch");
  const [ownerId, setOwnerId] = useState<string | null>(me.id);
  const [components, setComponents] = useState<DraftComponent[]>([]);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState("");
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);

  const typeById = new Map(types.map((t) => [t.id, t]));
  const dirty =
    !finished &&
    Boolean(name.trim() || outcome.trim() || launchDate || components.length || ownerId !== me.id);

  // Leaving with something entered asks first (answer 9: Discard or Keep editing).
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname)
        return;
      e.preventDefault();
      e.stopPropagation();
      setLeaveTo(url.pathname + url.search);
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  const update = (typeId: string, patch: Partial<DraftComponent>) =>
    setComponents((list) => list.map((c) => (c.typeId === typeId ? { ...c, ...patch } : c)));

  const nameError = name.trim() ? "" : "Give the capsule a name.";
  const spaceError = spaceId ? "" : "Choose a space.";
  const unused = types.filter((t) => !components.some((c) => c.typeId === t.id));

  function create() {
    setTried(true);
    if (nameError || spaceError) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setError("");
    start(async () => {
      const r = await createCapsule({
        space_id: spaceId,
        name,
        outcome,
        launch_date: launchDate,
        date_type: dateType,
        owner_id: ownerId,
        components: components.map((c) => ({
          component_type_id: c.typeId,
          owner_id: c.ownerId,
          due_date: c.dueDate,
          goal: c.goal,
          collaborators: c.collaborators,
          items: [
            ...c.items,
            ...(c.itemDraft.trim() ? [{ title: c.itemDraft, assigneeId: null }] : []),
          ].map((i) => ({
            title: i.title,
            assignee_id: i.assigneeId,
          })),
        })),
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setFinished(true);
      toast(`${r.data!.key} ${name.trim()} is ready.`);
      router.push(`/capsules/${r.data!.key.toLowerCase()}`);
    });
  }

  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-6 px-4 pt-6 pb-36 laptop:px-8 laptop:pt-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-[28px] leading-[34px] font-semibold tracking-[-0.02em]">
          Set up your capsule
        </h1>
        <p className="text-[15px] leading-[22px] text-muted-foreground">
          Add what you know now. Components, owners and dates can all wait until after you create
          it.
        </p>
      </div>

      <div className="flex flex-col gap-[18px] rounded-2xl border border-border bg-surface p-5 shadow-card">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="f-name">Name</Label>
          <Input
            id="f-name"
            className="h-11"
            maxLength={200}
            placeholder="What should we call it?"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={tried && nameError ? true : undefined}
          />
          <FieldError>{tried ? nameError : ""}</FieldError>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="f-outcome">Outcome</Label>
          <textarea
            id="f-outcome"
            rows={2}
            maxLength={1000}
            placeholder="What does done look like?"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            className="w-full resize-none rounded-[10px] border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-faint focus:border-control focus-visible:outline-none"
          />
        </div>
        <div className="grid grid-cols-1 gap-[18px] min-[640px]:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="f-space">Space</Label>
            <NativeSelect
              id="f-space"
              value={spaceId}
              onChange={(e) => setSpaceId(e.target.value)}
              aria-invalid={tried && spaceError ? true : undefined}
              className="h-10 aria-[invalid=true]:border-c-red-fg"
              wrapperClassName="w-full"
            >
              {!spaces.length && <option value="">No spaces yet</option>}
              {spaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.keyPrefix})
                </option>
              ))}
            </NativeSelect>
            <FieldError>{tried ? spaceError : ""}</FieldError>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] leading-[18px] font-medium">Date</span>
            <div className="flex h-10 items-center gap-2 rounded-[10px] border border-border bg-surface px-2.5">
              <span
                className="inline-flex gap-0.5 rounded-full bg-subtle p-0.5"
                role="radiogroup"
                aria-label="Date type"
              >
                {(["launch", "due"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={dateType === t}
                    onClick={() => setDateType(t)}
                    className={cn(
                      "h-6 rounded-full px-2.5 text-xs font-medium text-muted-foreground",
                      dateType === t && "bg-seg-on text-foreground shadow-seg-on",
                    )}
                  >
                    {t === "launch" ? "Launch" : "Due"}
                  </button>
                ))}
              </span>
              <CalendarBlank size={14} className="text-muted-foreground" aria-hidden="true" />
              <DateField
                value={launchDate}
                onPick={setLaunchDate}
                label={dateType === "launch" ? "Launch date" : "Due date"}
                placeholder="Pick a date"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] leading-[18px] font-medium">Capsule owner</span>
            <div className="flex h-10 items-center rounded-[10px] border border-border bg-surface px-2.5">
              <PersonPicker
                value={ownerId}
                people={people}
                meId={me.id}
                emptyLabel="No owner"
                label="Capsule owner"
                onPick={setOwnerId}
              />
            </div>
          </div>
        </div>
      </div>

      <section aria-labelledby="f-comps" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="f-comps" className="text-base leading-6 font-semibold">
            Components
          </h2>
          <p className="text-[13px] text-muted-foreground">
            The parts of the work, one per team. Add an owner and a date for each if you know them.
          </p>
        </div>
        {components.length > 0 && (
          <ul className="flex flex-col gap-3">
            {components.map((c) => {
              const t = typeById.get(c.typeId)!;
              return (
                <li
                  key={c.typeId}
                  className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card"
                >
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <span
                        aria-hidden="true"
                        className={cn(
                          "flex size-6 flex-none items-center justify-center rounded-md",
                          COMPONENT_COLOR_CLASSES[t.color].tag,
                        )}
                      >
                        <ComponentIcon icon={t.icon} size={14} />
                      </span>
                      <span className="font-semibold">{t.name}</span>
                    </span>
                    <span
                      className="flex items-center gap-1.5 text-muted-foreground"
                      title="Component owner"
                    >
                      <User size={14} aria-hidden="true" />
                      <PersonPicker
                        value={c.ownerId}
                        people={people}
                        meId={me.id}
                        emptyLabel="No owner"
                        label={`Owner of ${t.name}`}
                        onPick={(ownerId) => update(c.typeId, { ownerId })}
                      />
                    </span>
                    <span
                      className="flex items-center gap-1.5 text-muted-foreground"
                      title="Due date"
                    >
                      <CalendarBlank size={14} aria-hidden="true" />
                      <DateField
                        value={c.dueDate}
                        onPick={(dueDate) => update(c.typeId, { dueDate })}
                        label={`Due date for ${t.name}`}
                      />
                    </span>
                    <Button
                      variant="quiet"
                      size="icon"
                      aria-label={`Remove ${t.name}`}
                      onClick={() => setComponents((l) => l.filter((x) => x.typeId !== c.typeId))}
                    >
                      <X size={14} />
                    </Button>
                  </div>
                  <Input
                    size="sm"
                    className="w-full"
                    maxLength={200}
                    placeholder={`Goal: what does done look like for ${t.name}?`}
                    aria-label={`Goal for ${t.name}`}
                    value={c.goal}
                    onChange={(e) => update(c.typeId, { goal: e.target.value })}
                  />
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Collaborators</span>
                    {c.collaborators.map((id) => {
                      const p = people.find((x) => x.id === id);
                      return p ? (
                        <span
                          key={id}
                          className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-bg pr-1 pl-1.5 text-xs"
                        >
                          <Avatar name={p.name} initials={p.initials} />
                          {p.name}
                          <button
                            type="button"
                            aria-label={`Remove ${p.name}`}
                            onClick={() =>
                              update(c.typeId, {
                                collaborators: c.collaborators.filter((x) => x !== id),
                              })
                            }
                            className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-subtle"
                          >
                            <X size={10} />
                          </button>
                        </span>
                      ) : null;
                    })}
                    <PersonPicker
                      value={null}
                      people={people.filter(
                        (p) => p.id !== c.ownerId && !c.collaborators.includes(p.id),
                      )}
                      meId={me.id}
                      emptyLabel="Add"
                      label={`Add a collaborator to ${t.name}`}
                      onPick={(id) =>
                        id && update(c.typeId, { collaborators: [...c.collaborators, id] })
                      }
                      className="text-xs"
                    />
                  </div>
                  {c.items.length > 0 && (
                    <ul className="border-t border-divider">
                      {c.items.map((i) => (
                        <li
                          key={i.key}
                          className="flex min-h-10 items-center gap-3 border-b border-divider"
                        >
                          <span className="min-w-0 flex-1 truncate text-sm">{i.title}</span>
                          <PersonPicker
                            value={i.assigneeId}
                            people={people}
                            meId={me.id}
                            emptyLabel="Unassigned"
                            label={`Assignee for ${i.title}`}
                            onPick={(assigneeId) =>
                              update(c.typeId, {
                                items: c.items.map((x) =>
                                  x.key === i.key ? { ...x, assigneeId } : x,
                                ),
                              })
                            }
                            className="font-normal text-muted-foreground"
                          />
                          <button
                            type="button"
                            aria-label={`Remove ${i.title}`}
                            onClick={() =>
                              update(c.typeId, { items: c.items.filter((x) => x.key !== i.key) })
                            }
                            className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-subtle"
                          >
                            <X size={12} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex h-9 items-center gap-1.5 rounded-xl border border-dashed border-border pr-1.5 pl-2.5 text-muted-foreground focus-within:border-solid focus-within:border-control">
                    <Plus size={14} aria-hidden="true" />
                    <input
                      aria-label={`Add a work item to ${t.name}`}
                      placeholder="Add a work item"
                      maxLength={500}
                      value={c.itemDraft}
                      onChange={(e) => update(c.typeId, { itemDraft: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && c.itemDraft.trim()) {
                          e.preventDefault();
                          update(c.typeId, {
                            items: [
                              ...c.items,
                              { key: nextKey(), title: c.itemDraft.trim(), assigneeId: null },
                            ],
                            itemDraft: "",
                          });
                        }
                      }}
                      className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-faint focus-visible:outline-none"
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {unused.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {unused.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() =>
                  setComponents((l) => [
                    ...l,
                    {
                      typeId: t.id,
                      ownerId: null,
                      dueDate: null,
                      goal: "",
                      collaborators: [],
                      items: [],
                      itemDraft: "",
                    },
                  ])
                }
                className="inline-flex h-[30px] items-center gap-1.5 rounded-full border border-border bg-bg px-3 text-[13px] hover:bg-subtle"
              >
                <span
                  aria-hidden="true"
                  className={cn("size-2 rounded-full", COMPONENT_COLOR_CLASSES[t.color].dot)}
                />
                + {t.name}
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/95 backdrop-blur laptop:left-[68px] wide:left-[248px] [[data-nav=collapsed]_&]:wide:left-[68px]">
        <div className="mx-auto flex max-w-[860px] flex-wrap items-center gap-3 px-4 py-3 laptop:px-8">
          <span className="min-w-0 flex-1 text-[13px] text-muted-foreground">
            Component owners will be notified when you click create.
          </span>
          {error && <FieldError>{error}</FieldError>}
          <Button variant="primary" size="lg" onClick={create} disabled={pending}>
            {pending ? "Creating…" : "Create capsule"}
          </Button>
        </div>
      </div>

      <Dialog open={leaveTo !== null} onOpenChange={(o) => !o && setLeaveTo(null)}>
        <DialogContent role="alertdialog">
          <DialogTitle>Leave without creating?</DialogTitle>
          <p className="-mt-2 text-[13px] leading-[18px] text-muted-foreground">
            {name.trim()
              ? `“${name.trim()}” isn’t created yet.`
              : "This capsule isn’t created yet."}{" "}
            If you leave now, what you’ve entered is discarded.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              size="md"
              onClick={() => {
                setFinished(true);
                const to = leaveTo!;
                setLeaveTo(null);
                router.push(to);
              }}
            >
              Discard
            </Button>
            <Button variant="primary" size="md" onClick={() => setLeaveTo(null)}>
              Keep editing
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
