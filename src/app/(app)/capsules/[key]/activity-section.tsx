"use client";

import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowUp } from "@phosphor-icons/react";
import { Avatar } from "@/components/avatar";
import { ComponentIcon } from "@/components/component-icon";
import { buildFeed, describe, splitMentions, type FeedEntry } from "@/lib/activity";
import type { CapsuleData, Permissions, PersonRef } from "@/lib/capsule-types";
import { fmtRelative } from "@/lib/dates";
import { COMPONENT_COLOR_CLASSES } from "@/lib/design";
import { cn } from "@/lib/utils";
import { deleteComment, postComment, restoreComment } from "../actions";
import type { useCapsule } from "./use-capsule";

type Change = ReturnType<typeof useCapsule>["change"];

const SHOW = 8;
let pendingSeq = 0;

/** Everyone who can be @mentioned: the capsule's team (design-decisions.md section 12). */
export function teamOf(view: CapsuleData): PersonRef[] {
  const ids = new Set<string>();
  if (view.capsule.ownerId) ids.add(view.capsule.ownerId);
  for (const k of view.components) {
    if (k.ownerId) ids.add(k.ownerId);
    k.collaborators.forEach((p) => ids.add(p.userId));
  }
  return view.people.filter((p) => ids.has(p.id));
}

/** The capsule's Activity feed and comment box (prototype side panel). */
export function ActivitySection({
  view,
  perms,
  change,
}: {
  view: CapsuleData;
  perms: Permissions;
  change: Change;
}) {
  const [all, setAll] = useState(false);
  const feed = useMemo(() => buildFeed(view.activity), [view.activity]);
  const shown = all ? feed : feed.slice(0, SHOW);
  const team = useMemo(() => teamOf(view), [view]);

  function remove(e: FeedEntry) {
    const ids = { orgId: view.capsule.orgId, capsuleId: view.capsule.id, commentId: e.id };
    const marker = (kind: string) => ({
      type: "addEvent" as const,
      event: {
        id: `pending-${++pendingSeq}`,
        kind,
        actorId: view.me.id,
        data: { comment_id: e.id },
        at: new Date().toISOString(),
      },
    });
    change(marker("comment_deleted"), () => deleteComment(ids), {
      message: "Comment deleted.",
      undo: { op: marker("comment_restored"), save: () => restoreComment(ids) },
    });
  }

  return (
    <section aria-labelledby="act-h" className="flex flex-col gap-3">
      <h2 id="act-h" className="text-base leading-6 font-semibold">
        Activity
      </h2>
      {feed.length > 0 ? (
        <ol className="rounded-2xl border border-border bg-surface px-4 py-1 shadow-card">
          {shown.map((e) => (
            <Row key={e.id} e={e} view={view} team={team} onDelete={() => remove(e)} />
          ))}
          {feed.length > SHOW && (
            <li className="py-3">
              <button
                type="button"
                onClick={() => setAll((v) => !v)}
                className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
              >
                {all ? "Show less" : `Show all ${feed.length}`}
              </button>
            </li>
          )}
        </ol>
      ) : (
        <p className="rounded-2xl border border-border bg-surface p-4 text-[13px] text-muted-foreground shadow-card">
          Changes and comments on this capsule will show up here.
        </p>
      )}
      {perms.onTeam && <CommentBox view={view} team={team} change={change} />}
    </section>
  );
}

function Row({
  e,
  view,
  team,
  onDelete,
}: {
  e: FeedEntry;
  view: CapsuleData;
  team: PersonRef[];
  onDelete: () => void;
}) {
  const actor = view.people.find((p) => p.id === e.actorId);
  const isMe = e.actorId === view.me.id;
  const name = isMe ? "You" : (actor?.name ?? "Someone");
  const pending = e.id.startsWith("pending-");
  const text = describe(e, {
    meId: view.me.id,
    nameOf: (id) => view.people.find((p) => p.id === id)?.name,
    dateType: view.capsule.dateType,
  });

  return (
    <li
      className={cn(
        "flex items-start gap-2.5 border-b border-divider py-3 last:border-b-0",
        pending && "opacity-60",
      )}
    >
      <Avatar name={actor?.name ?? name} initials={actor?.initials ?? "?"} size={24} me={isMe} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="m-0 text-[13px] leading-[18px] break-words">
          <b className="font-semibold">{name}</b>{" "}
          {e.kind === "comment"
            ? splitMentions(text, team).map((part, i) =>
                part.mention ? (
                  <span key={i} className="font-medium text-c-blue-fg">
                    {part.text}
                  </span>
                ) : (
                  <span key={i} className="whitespace-pre-wrap">
                    {part.text}
                  </span>
                ),
              )
            : text}
        </p>
        <span className="flex flex-wrap items-center gap-1.5 text-xs leading-4 text-muted-foreground">
          <ComponentTag view={view} e={e} />
          <span suppressHydrationWarning>{pending ? "Posting…" : fmtRelative(e.at)}</span>
          {e.kind === "comment" && isMe && !pending && (
            <>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={onDelete}
                className="font-medium text-muted-foreground hover:text-foreground hover:underline"
              >
                Delete
              </button>
            </>
          )}
        </span>
      </div>
    </li>
  );
}

/** The component an entry is about, as a colored tag (prototype compTag). */
function ComponentTag({ view, e }: { view: CapsuleData; e: FeedEntry }) {
  const name = typeof e.data.component === "string" ? e.data.component : null;
  if (!name) return null;
  const id = e.data.component_id;
  const k =
    view.components.find((c) => c.id === id) ??
    view.componentTypes.find((t) => t.name === name) ??
    null;
  const color = k?.color ?? "gray";
  return (
    <span
      className={cn(
        "inline-flex h-5 flex-none items-center gap-1 rounded-md pr-[7px] pl-1.5 text-xs leading-5 font-medium whitespace-nowrap",
        COMPONENT_COLOR_CLASSES[color].tag,
      )}
    >
      <ComponentIcon icon={k?.icon} size={12} aria-hidden="true" />
      {name}
    </span>
  );
}

/** "Comment or @mention someone", with a picker of the capsule's team. */
function CommentBox({
  view,
  team,
  change,
}: {
  view: CapsuleData;
  team: PersonRef[];
  change: Change;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [text, setText] = useState("");
  const [query, setQuery] = useState<{ start: number; q: string } | null>(null);
  const [active, setActive] = useState(0);
  // Where the cursor goes after a name is picked (applied right after render,
  // before the next keystroke).
  const cursorAfterPick = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (cursorAfterPick.current === null) return;
    inputRef.current?.setSelectionRange(cursorAfterPick.current, cursorAfterPick.current);
    cursorAfterPick.current = null;
  }, [text]);
  const others = team.filter((p) => p.id !== view.me.id);

  const matches = query
    ? others
        .filter((p) =>
          p.name
            .toLowerCase()
            .split(/\s+/)
            .concat(p.name.toLowerCase())
            .some((w) => w.startsWith(query.q.toLowerCase())),
        )
        .slice(0, 6)
    : [];
  const open = query !== null && matches.length > 0;

  /** Finds an "@name" being typed just before the cursor. */
  function track(value: string, cursor: number) {
    const before = value.slice(0, cursor);
    const at = before.lastIndexOf("@");
    if (at === -1 || (at > 0 && !/\s|\(/.test(before[at - 1]))) return setQuery(null);
    const q = before.slice(at + 1);
    if (q.length > 30 || /\n/.test(q) || /\s{2}/.test(q)) return setQuery(null);
    setQuery({ start: at, q });
    setActive(0);
  }

  function pick(p: PersonRef) {
    if (!query) return;
    const end = query.start + 1 + query.q.length;
    const next = `${text.slice(0, query.start)}@${p.name} ${text.slice(end)}`;
    const cursor = query.start + p.name.length + 2;
    cursorAfterPick.current = cursor;
    setText(next);
    setQuery(null);
  }

  function post() {
    const body = text.trim();
    if (!body) return;
    const mentions = [
      ...new Set(
        splitMentions(body, others)
          .map((p) => p.mention)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    change(
      {
        type: "addEvent",
        event: {
          id: `pending-${++pendingSeq}`,
          kind: "comment",
          actorId: view.me.id,
          data: { body },
          at: new Date().toISOString(),
        },
      },
      () => postComment({ capsuleId: view.capsule.id, body, mentions }),
    );
    setText("");
    setQuery(null);
  }

  return (
    <div className="relative">
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="People on this capsule"
          className="absolute bottom-[calc(100%+6px)] left-0 z-20 w-64 max-w-full rounded-xl border border-border bg-pop p-1 shadow-pop"
        >
          {matches.map((p, i) => (
            <li
              key={p.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(p);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                "flex h-9 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm",
                i === active && "bg-hover",
              )}
            >
              <Avatar name={p.name} initials={p.initials} />
              <span className="truncate">{p.name}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex h-10 items-center gap-1.5 rounded-xl border border-border bg-surface pr-1.5 pl-2.5 focus-within:border-control">
        <Avatar name={view.me.name} initials={view.me.initials} me />
        <label htmlFor="comment" className="sr-only">
          Comment
        </label>
        <input
          ref={inputRef}
          id="comment"
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open ? `${listId}-${active}` : undefined}
          aria-autocomplete="list"
          value={text}
          maxLength={2000}
          autoComplete="off"
          placeholder="Comment or @mention someone"
          onChange={(e) => {
            setText(e.target.value);
            track(e.target.value, e.target.selectionStart ?? e.target.value.length);
          }}
          onKeyDown={(e) => {
            if (open) {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const d = e.key === "ArrowDown" ? 1 : -1;
                setActive((a) => (a + d + matches.length) % matches.length);
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                pick(matches[active]);
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setQuery(null);
                return;
              }
            }
            if (e.key === "Enter") {
              e.preventDefault();
              post();
            }
          }}
          onBlur={() => setQuery(null)}
          className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-faint focus-visible:outline-none"
        />
        <button
          type="button"
          aria-label="Post comment"
          disabled={!text.trim()}
          onClick={post}
          className="flex size-7 flex-none items-center justify-center rounded-full bg-primary text-foreground hover:bg-primary-hover disabled:bg-disabled disabled:text-disabled-foreground"
        >
          <ArrowUp size={14} weight="bold" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
