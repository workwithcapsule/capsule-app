"use client";

import { Check, Plus } from "@phosphor-icons/react";
import { SignOutButton } from "@/components/centered-page";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/*
 * Pieces shared by the two first-run flows: onboarding (first person in an
 * org) and joining (invited people). Layout and styles follow the prototype.
 */

export function Heading({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <>
      <h1 className="text-[28px] leading-[34px] font-semibold tracking-[-0.02em]">{title}</h1>
      {children && <p className="text-muted-foreground">{children}</p>}
    </>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-border bg-surface shadow-card", className)}>
      {children}
    </div>
  );
}

export function Row({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 border-t border-divider px-5 py-3.5 first:border-t-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** The dashed "add something" line from the prototype. */
export function AddLine({
  id,
  label,
  value,
  onChange,
  onAdd,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  onAdd: () => void;
}) {
  const ready = value.trim().length > 0;
  return (
    <div className="flex h-10 items-center gap-1.5 rounded-xl border border-dashed border-border pr-1.5 pl-2.5 text-muted-foreground focus-within:border-solid focus-within:border-control">
      <Plus size={14} aria-hidden="true" />
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        value={value}
        placeholder={label}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (ready) onAdd();
          }
        }}
        className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-faint focus-visible:outline-none"
      />
      <Button
        variant={ready ? "primary" : "secondary"}
        className="h-7 px-3"
        disabled={!ready}
        onClick={onAdd}
      >
        Add
      </Button>
    </div>
  );
}

export function Nav({
  onBack,
  onNext,
  label,
  blocked,
  pending,
}: {
  onBack?: () => void;
  onNext: () => void;
  label: string;
  blocked?: boolean;
  pending?: boolean;
}) {
  return (
    <div className="mt-2 flex gap-2">
      {onBack && (
        <Button variant="secondary" size="lg" onClick={onBack} disabled={pending}>
          Back
        </Button>
      )}
      <Button variant="primary" size="lg" onClick={onNext} disabled={blocked || pending}>
        {pending ? "Saving…" : label}
      </Button>
    </div>
  );
}

export function ServerError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-[10px] bg-c-red px-3 py-2 text-[13px] text-c-red-fg">
      {message}
    </p>
  );
}

/** The left-hand step list and the centered column, as in the prototype. */
export function SetupFrame({
  label,
  steps,
  step,
  furthest,
  onGo,
  disabled,
  children,
}: {
  label: string;
  steps: string[];
  step: number;
  furthest: number;
  onGo: (step: number) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col laptop:flex-row">
      <aside className="sticky top-0 hidden h-dvh w-[248px] flex-none flex-col gap-4 border-r border-border px-3 pt-5 pb-4 laptop:flex">
        <span className="px-2.5 text-lg leading-6 font-semibold tracking-[-0.02em]">Capsule</span>
        <p className="mt-3 px-2.5 text-xs leading-4 font-medium text-muted-foreground">{label}</p>
        <nav aria-label="Setup steps" className="flex flex-col gap-0.5">
          {steps.map((name, i) => {
            const n = i + 1;
            const on = n === step;
            const done = !on && (n < step || n < furthest);
            return (
              <button
                key={name}
                type="button"
                disabled={n > furthest || disabled}
                aria-current={on ? "step" : undefined}
                onClick={() => onGo(n)}
                className={cn(
                  "flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm font-medium text-muted-foreground disabled:cursor-default",
                  on && "bg-subtle font-semibold text-foreground",
                  done && "text-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex size-[22px] flex-none items-center justify-center rounded-full border-[1.5px] border-dash text-[11px] font-semibold",
                    on && "border-foreground",
                    done && "border-foreground bg-foreground text-bg",
                  )}
                >
                  {done ? <Check size={11} weight="bold" /> : n}
                </span>
                {name}
              </button>
            );
          })}
        </nav>
        <SignOutButton className="mt-auto px-2.5" />
      </aside>

      <header className="flex h-[57px] items-center justify-between border-b border-border px-4 laptop:hidden">
        <span className="px-2.5 text-lg leading-6 font-semibold tracking-[-0.02em]">Capsule</span>
        <span className="text-xs text-muted-foreground">
          Step {step} of {steps.length} · {steps[step - 1]}
        </span>
      </header>

      <main className="mx-auto w-full max-w-[640px] px-4 pt-8 pb-[72px] laptop:px-8 laptop:pt-14">
        <div key={step} className="flex animate-rise flex-col gap-4">
          {children}
        </div>
      </main>
    </div>
  );
}
