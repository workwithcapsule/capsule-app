"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { CaretDown, Check, X } from "@phosphor-icons/react";
import { dismissAttention, undoDismissAttention } from "@/app/(app)/home/actions";
import { ComponentIcon } from "@/components/component-icon";
import { useToast } from "@/components/toaster";
import { Button } from "@/components/ui/button";
import { attentionHref, attentionKey, type AttentionRow } from "@/lib/attention";
import type { PersonRef } from "@/lib/capsule-types";
import { daysUntil, fmtDate, fmtRelative } from "@/lib/dates";
import { COMPONENT_COLOR_CLASSES } from "@/lib/design";
import { cn } from "@/lib/utils";

const SHOW = 5;

type Op = { type: "hide" | "show"; key: string };

/**
 * Needs your attention (design-decisions.md section 9, build-decisions.md 12
 * and 37): one-line rows that expand on click, an Open button into the
 * capsule, when the row arrived, and an X with Undo. "home" caps the list at
 * five with Show all; "capsule" is the compact "Needs you here" strip.
 */
export function AttentionList({
  rows,
  orgId,
  people,
  variant,
}: {
  rows: AttentionRow[];
  orgId: string;
  people: PersonRef[];
  variant: "home" | "capsule";
}) {
  const toast = useToast();
  const [, start] = useTransition();
  const [hidden, change] = useOptimistic(new Set<string>(), (set, op: Op) => {
    const next = new Set(set);
    if (op.type === "hide") next.add(op.key);
    else next.delete(op.key);
    return next;
  });
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState(false);

  const visible = rows.filter((r) => !hidden.has(attentionKey(r)));
  const shown = variant === "home" && !all ? visible.slice(0, SHOW) : visible;
  const nameOf = (id: string | null) => people.find((p) => p.id === id)?.name ?? "Someone";

  function dismiss(r: AttentionRow) {
    const key = attentionKey(r);
    start(async () => {
      change({ type: "hide", key });
      const res = await dismissAttention({
        orgId,
        capsuleId: r.capsuleId,
        kind: r.kind,
        targetId: r.targetId,
        since: r.since,
      });
      if (!res.ok) return toast(res.error);
      toast("Removed from your list.", {
        undo: () =>
          start(async () => {
            const u = await undoDismissAttention({ kind: r.kind, targetId: r.targetId });
            if (!u.ok) toast(u.error);
          }),
      });
    });
  }

  if (!visible.length) {
    if (variant === "capsule") return null;
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface px-6 py-8 text-center shadow-card">
        <span className="inline-flex size-10 items-center justify-center rounded-full bg-subtle text-muted-foreground">
          <Check size={20} aria-hidden="true" />
        </span>
        <div className="flex flex-col gap-1">
          <p className="font-semibold">You’re all caught up</p>
          <p className="text-[13px] text-muted-foreground">
            Nothing needs you right now. Work assigned to you and components you own show up here as
            soon as they need you.
          </p>
        </div>
        <Link href="/capsules" className="text-sm">
          Browse your capsules
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-surface shadow-card">
      <ul>
        {shown.map((r) => {
          const key = attentionKey(r);
          const isOpen = open === key;
          return (
            <li key={key} className="group border-t border-divider first:border-t-0">
              <div className="flex min-h-14 items-center gap-2 py-2 pr-2 pl-4 laptop:gap-3">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : key)}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-lg py-1 text-left"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium">
                      {title(r, nameOf, variant)}
                    </span>
                    <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs leading-4 text-muted-foreground">
                      <Context r={r} variant={variant} />
                    </span>
                  </span>
                  <CaretDown
                    size={12}
                    aria-hidden="true"
                    className={cn(
                      "flex-none text-faint transition-transform motion-reduce:transition-none",
                      isOpen && "rotate-180",
                    )}
                  />
                </button>
                <Button asChild variant="primary" className="h-8 flex-none px-3.5">
                  <Link href={attentionHref(r)}>Open</Link>
                </Button>
                <span
                  className="hidden w-16 flex-none text-right text-xs text-muted-foreground laptop:block"
                  suppressHydrationWarning
                >
                  {fmtRelative(r.since)}
                </span>
                <button
                  type="button"
                  aria-label={`Remove “${title(r, nameOf, variant)}” from your list`}
                  onClick={() => dismiss(r)}
                  className="inline-flex size-8 flex-none items-center justify-center rounded-full text-muted-foreground hover:bg-subtle hover:text-foreground focus-visible:opacity-100 laptop:opacity-0 laptop:group-hover:opacity-100"
                >
                  <X size={16} />
                </button>
              </div>
              {isOpen && (
                <p className="px-4 pb-3.5 text-[13px] leading-[18px] whitespace-pre-wrap text-muted-foreground">
                  {details(r, nameOf)}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {variant === "home" && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-divider px-4 py-3 text-xs text-muted-foreground">
          <span>
            {visible.length > SHOW && !all
              ? `Showing ${SHOW} of ${visible.length}`
              : "That’s everything that needs you."}
          </span>
          {visible.length > SHOW && (
            <button
              type="button"
              onClick={() => setAll((v) => !v)}
              className="font-medium hover:text-foreground hover:underline"
            >
              {all ? "Show fewer" : `Show all ${visible.length}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function title(r: AttentionRow, nameOf: (id: string | null) => string, variant: string) {
  switch (r.kind) {
    case "item":
      return r.title;
    case "component":
      return variant === "capsule"
        ? `${r.componentName}: you own it`
        : `${r.componentName} on ${r.capsuleName}`;
    case "no_owner":
      return `${r.componentName} needs an owner`;
    case "mention":
      return variant === "capsule"
        ? `${nameOf(r.actorId)} mentioned you`
        : `${nameOf(r.actorId)} mentioned you in ${r.capsuleName}`;
  }
}

function Due({ date }: { date: string }) {
  const d = daysUntil(date);
  return (
    <span className={cn(d < 0 && "font-medium text-c-red-fg")} suppressHydrationWarning>
      {d < 0 ? `Overdue · ${fmtDate(date)}` : d === 0 ? "Due today" : `Due ${fmtDate(date)}`}
    </span>
  );
}

function Context({ r, variant }: { r: AttentionRow; variant: string }) {
  const dot = <span aria-hidden="true">·</span>;
  const key = variant === "home" && <span className="font-mono">{r.capsuleKey}</span>;
  if (r.kind === "mention") {
    return (
      <>
        {key}
        {key && dot}
        <span className="truncate">“{r.body}”</span>
      </>
    );
  }
  return (
    <>
      {r.componentName && (
        <span
          className={cn(
            "inline-flex h-5 flex-none items-center gap-1 rounded-md pr-[7px] pl-1.5 font-medium whitespace-nowrap",
            COMPONENT_COLOR_CLASSES[r.componentColor ?? "gray"].tag,
          )}
        >
          <ComponentIcon icon={r.componentIcon} size={12} aria-hidden="true" />
          {r.componentName}
        </span>
      )}
      {key}
      <span>
        {r.kind === "item"
          ? "Assigned to you"
          : r.kind === "component"
            ? "You own it"
            : "On a capsule you own"}
      </span>
      {r.dueDate && (
        <>
          {dot}
          <Due date={r.dueDate} />
        </>
      )}
    </>
  );
}

function details(r: AttentionRow, nameOf: (id: string | null) => string) {
  const due = r.dueDate ? ` ${r.componentName} is due ${fmtDate(r.dueDate)}.` : "";
  switch (r.kind) {
    case "item":
      return `Assigned to you in ${r.componentName} on ${r.capsuleKey} ${r.capsuleName}.${due}`;
    case "component":
      return `You own ${r.componentName} on ${r.capsuleKey} ${r.capsuleName}. Open it to update its status and work items.${due}`;
    case "no_owner":
      return `Nobody owns ${r.componentName} on ${r.capsuleKey} ${r.capsuleName} yet. Pick an owner so someone’s accountable.`;
    case "mention":
      return `${nameOf(r.actorId)}: “${r.body}”`;
  }
}
