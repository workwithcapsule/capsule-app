"use client";

import { useRef } from "react";
import { CaretDown, Check } from "@phosphor-icons/react";
import { Avatar } from "@/components/avatar";
import { StatusPill } from "@/components/status-pill";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STATUSES, type Status } from "@/lib/design";
import type { PersonRef } from "@/lib/capsule-types";
import { fmtDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

/*
 * Pick-and-save controls (design-decisions.md section 14): click, pick from
 * a menu, and it saves right away. Dates: picking a date saves; closing the
 * picker without choosing cancels.
 */

const trigger =
  "-mx-1.5 inline-flex max-w-full items-center gap-1.5 rounded-lg px-1.5 py-0.5 text-left hover:bg-subtle data-[state=open]:bg-subtle";

export function StatusPicker({
  value,
  onPick,
  label,
}: {
  value: Status;
  onPick: (s: Status) => void;
  label: string;
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger className={cn(trigger, "px-1")} aria-label={`${label}: change`}>
        <StatusPill status={value} />
        <CaretDown size={10} className="text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[180px]">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        {STATUSES.map((s) => (
          <DropdownMenuItem key={s} onSelect={() => s !== value && onPick(s)}>
            <StatusPill status={s} />
            {s === value && <Check size={14} className="ml-auto text-muted-foreground" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PersonPicker({
  value,
  people,
  onPick,
  label,
  emptyLabel,
  meId,
  className,
}: {
  value: string | null;
  people: PersonRef[];
  onPick: (id: string | null) => void;
  label: string;
  /** "No owner" or "Unassigned". Omit to require a person. */
  emptyLabel?: string;
  meId?: string;
  className?: string;
}) {
  const current = people.find((p) => p.id === value) ?? null;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        className={cn(trigger, "text-[13px] font-medium", className)}
        aria-label={`${label}: change`}
      >
        {current ? (
          <>
            <Avatar name={current.name} initials={current.initials} />
            <span className="truncate">{current.name}</span>
          </>
        ) : (
          <>
            <span
              aria-hidden="true"
              className="size-[22px] flex-none rounded-full border border-dashed border-dash"
            />
            <span className="text-faint">{emptyLabel ?? "Choose"}</span>
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-[240px] overflow-y-auto">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        {emptyLabel && (
          <DropdownMenuItem onSelect={() => value !== null && onPick(null)}>
            <span
              aria-hidden="true"
              className="size-[22px] flex-none rounded-full border border-dashed border-dash"
            />
            <span className="flex-1">{emptyLabel}</span>
            {value === null && <Check size={14} className="text-muted-foreground" />}
          </DropdownMenuItem>
        )}
        {people.map((p) => (
          <DropdownMenuItem key={p.id} onSelect={() => p.id !== value && onPick(p.id)}>
            <Avatar name={p.name} initials={p.initials} />
            <span className="flex-1 truncate">
              {p.name}
              {p.id === meId ? " (you)" : ""}
            </span>
            {p.id === value && <Check size={14} className="text-muted-foreground" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DateField({
  value,
  onPick,
  label,
  placeholder = "No date",
  className,
}: {
  value: string | null;
  onPick: (iso: string | null) => void;
  label: string;
  placeholder?: string;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={`${label}: ${value ? fmtDate(value) : "none"}. Change`}
        onClick={() => {
          const el = input.current;
          if (!el) return;
          try {
            el.showPicker();
          } catch {
            el.focus();
          }
        }}
        className={cn(
          trigger,
          "text-[13px] font-medium whitespace-nowrap",
          !value && "text-faint",
          className,
        )}
      >
        {value ? fmtDate(value) : placeholder}
      </button>
      <input
        ref={input}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={value ?? ""}
        onChange={(e) => onPick(e.target.value || null)}
        className="pointer-events-none absolute inset-0 opacity-0"
      />
    </span>
  );
}
