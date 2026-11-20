"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarBlank, Warning } from "@phosphor-icons/react";
import { AvatarStack } from "@/components/avatar";
import {
  HOME_FILTERS,
  homeOrder,
  matchesHomeFilter,
  progressLabel,
  riskOf,
  type HomeFilter,
} from "@/lib/capsule-summary";
import type { CapsuleRow } from "@/lib/capsules-list";
import { fmtDate, parseDate } from "@/lib/dates";
import { useLocalTime } from "@/lib/use-local-time";
import { cn } from "@/lib/utils";

const SHOW = 6;
const FILTER_KEY = "capsule-home-filter";

const SEG: Record<string, string> = {
  done: "bg-p-done",
  in_progress: "bg-p-prog",
  in_review: "bg-p-rev",
};

/** One bar segment per component, in its status color (prototype segs). */
export function Segments({ row }: { row: CapsuleRow }) {
  return (
    <span className="flex w-full gap-[3px]" aria-hidden="true">
      {row.components.map((k, i) => (
        <span
          key={i}
          title={k.name}
          className={cn("h-1 flex-1 rounded-full bg-p-empty", SEG[k.status])}
        />
      ))}
    </span>
  );
}

/** "Tech is blocked" or "Support has no owner", in the warning color. */
export function RiskLine({ text }: { text: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs leading-4 text-c-amber-fg">
      <Warning size={12} aria-hidden="true" className="flex-none" />
      {text}
    </span>
  );
}

/** The browser's today, or null while rendering on the server (so dates never disagree). */
export function useToday(): Date | null {
  const local = useLocalTime();
  return local ? parseDate(local.day) : null;
}

/**
 * Home's "Your capsules" (prototype capCardsPanel): open capsules you created, work
 * on or follow, with filters, a progress bar and what's putting each one at risk.
 */
export function YourCapsules({ rows }: { rows: CapsuleRow[] }) {
  const today = useToday();
  const [filter, setFilter] = useState<HomeFilter>("all");

  // The filter is remembered in this browser only.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(FILTER_KEY) as HomeFilter | null;
      if (saved && saved !== "all" && HOME_FILTERS.some(([f]) => f === saved)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the browser
        setFilter(saved);
      }
    } catch {}
  }, []);
  const pick = (f: HomeFilter) => {
    setFilter(f);
    try {
      localStorage.setItem(FILTER_KEY, f);
    } catch {}
  };

  const order = homeOrder(rows);
  const list = order.filter((r) => matchesHomeFilter(r, filter));

  return (
    <aside aria-labelledby="caps-h" className="flex min-w-0 flex-[1_1_340px] flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="caps-h" className="text-base leading-6 font-semibold">
          Your capsules
        </h2>
        {rows.length > 0 && (
          <Link href="/capsules" className="text-[13px] font-medium">
            See all
          </Link>
        )}
      </div>
      {rows.length ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card">
          <div role="group" aria-label="Filter by relationship" className="flex flex-wrap gap-1.5">
            {HOME_FILTERS.map(([f, label]) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => pick(f)}
                className={cn(
                  "inline-flex h-[30px] items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium",
                  filter === f
                    ? "border-primary bg-primary"
                    : "border-border bg-surface hover:bg-subtle",
                )}
              >
                {label}{" "}
                <span className="text-muted-foreground">
                  {order.filter((r) => matchesHomeFilter(r, f)).length}
                </span>
              </button>
            ))}
          </div>
          <div className="flex flex-col">
            {list.length ? (
              list.slice(0, SHOW).map((r) => {
                const risk = today ? riskOf(r, today) : "";
                return (
                  <Link
                    key={r.id}
                    href={`/capsules/${r.key.toLowerCase()}`}
                    className="-mx-2 flex flex-col gap-2.5 rounded-[10px] border-t border-divider px-2 py-3.5 text-foreground no-underline hover:bg-hover"
                  >
                    <span className="flex items-start gap-2">
                      <span className="grow font-semibold">{r.name}</span>
                      {r.isNew && (
                        <span className="inline-flex h-5 flex-none items-center rounded-md bg-c-orange px-[7px] text-xs font-medium text-c-orange-fg">
                          New
                        </span>
                      )}
                    </span>
                    <Segments row={r} />
                    {risk && <RiskLine text={risk} />}
                    <span className="flex w-full items-center gap-2.5">
                      <span className="flex grow flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        <span className="font-mono">{r.key}</span>
                        <span>{progressLabel(r)}</span>
                        {r.launchDate && (
                          <span className="flex items-center gap-1">
                            <CalendarBlank size={12} aria-hidden="true" />
                            {fmtDate(r.launchDate)}
                          </span>
                        )}
                      </span>
                      {r.team.length > 0 && <AvatarStack people={r.team} max={4} />}
                    </span>
                  </Link>
                );
              })
            ) : (
              <p className="mt-2 mb-1 text-[13px] text-muted-foreground">
                Nothing here for this filter.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface px-2 pt-9 pb-7 text-center shadow-card">
          <span aria-hidden="true" className="flex gap-1">
            <span className="h-3.5 w-7 rounded-full bg-border" />
            <span className="h-3.5 w-11 rounded-full bg-avatar" />
            <span className="h-3.5 w-5 rounded-full bg-subtle" />
          </span>
          <span className="flex flex-col gap-1 px-4">
            <span className="text-[15px] leading-[22px] font-semibold">No capsules yet</span>
            <span className="text-[13px] text-muted-foreground">
              A capsule holds one outcome, like a launch, a fix or a rollout, plus everyone working
              on it. Capsules you create, work on or follow will appear here.
            </span>
          </span>
        </div>
      )}
    </aside>
  );
}
