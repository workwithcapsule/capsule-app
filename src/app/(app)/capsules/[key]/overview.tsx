"use client";

import type { CapsuleData } from "@/lib/capsule-types";
import { daysUntil, fmtDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

const SEGMENT: Record<string, string> = {
  done: "bg-p-done",
  in_progress: "bg-p-prog",
  in_review: "bg-p-rev",
};

function Stat({ k, v, sub }: { k: string; v: string; sub: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs leading-4 text-muted-foreground">{k}</span>
      <span className="text-[22px] leading-7 font-semibold tracking-[-0.01em]">{v}</span>
      <span className="truncate text-xs leading-4 text-muted-foreground">{sub}</span>
    </div>
  );
}

/** Days to launch, components done, work items done, components with no owner, and progress. */
export function Overview({ view }: { view: CapsuleData }) {
  const c = view.capsule;
  const days = c.launchDate ? daysUntil(c.launchDate) : null;
  const compsDone = view.components.filter((k) => k.status === "done").length;
  const itemsDone = view.items.filter((i) => i.done).length;
  const unowned = view.components.filter((k) => !k.ownerId);
  const label = c.dateType === "due" ? "Due in" : "Launch in";

  return (
    <section aria-labelledby="ov-h" className="flex flex-col gap-3">
      <h2 id="ov-h" className="text-base leading-6 font-semibold">
        Overview
      </h2>
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 shadow-card">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-4">
          <Stat
            k={label}
            v={
              days === null
                ? "No date"
                : days === 0
                  ? "Today"
                  : days > 0
                    ? plural(days, "day")
                    : `${Math.abs(days)} days ago`
            }
            sub={c.launchDate ? fmtDate(c.launchDate) : "Set a date in the header"}
          />
          <Stat k="Components done" v={String(compsDone)} sub={`of ${view.components.length}`} />
          <Stat k="Work items done" v={String(itemsDone)} sub={`of ${view.items.length}`} />
          <Stat
            k="No owner"
            v={String(unowned.length)}
            sub={unowned.length ? unowned.map((k) => k.name).join(", ") : "Every component has one"}
          />
        </div>
        {view.components.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex gap-1" aria-hidden="true">
              {view.components.map((k) => (
                <span
                  key={k.id}
                  title={k.name}
                  className={cn("h-1.5 flex-1 rounded-full bg-p-empty", SEGMENT[k.status])}
                />
              ))}
            </div>
            <div className="flex gap-1">
              {view.components.map((k) => (
                <span
                  key={k.id}
                  className="flex-1 truncate text-[11px] leading-[14px] text-muted-foreground"
                >
                  {k.name}
                </span>
              ))}
            </div>
            <div
              role="list"
              aria-label="Key"
              className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-divider pt-1.5 text-xs text-muted-foreground"
            >
              {[
                ["bg-p-done", "Done"],
                ["bg-p-prog", "In progress"],
                ["bg-p-rev", "In review"],
                ["bg-p-empty", "Not started"],
              ].map(([cls, name]) => (
                <span key={name} role="listitem" className="flex items-center gap-1.5">
                  <span className={cn("h-1.5 w-3.5 rounded-full", cls)} />
                  {name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
