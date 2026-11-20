"use client";

import Link from "next/link";
import { CalendarBlank, Check, Warning } from "@phosphor-icons/react";
import { StatusPill } from "@/components/status-pill";
import { followSummary, launchIn, plural, riskOf } from "@/lib/capsule-summary";
import type { CapsuleRow } from "@/lib/capsules-list";
import { fmtDate } from "@/lib/dates";
import { RiskLine, Segments, useToday } from "./your-capsules";

/**
 * "Capsules you follow" (prototype followGlance), at the top of Home for people who
 * follow capsules but aren't on any: one card each, with what's at risk.
 */
export function FollowedCapsules({ rows }: { rows: CapsuleRow[] }) {
  const today = useToday();
  const summary = today ? followSummary(rows, today) : null;

  return (
    <section aria-labelledby="glance-h" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="glance-h" className="text-base leading-6 font-semibold">
          Capsules you follow
        </h2>
        {summary && (
          <span className="flex items-center gap-3 text-[13px] text-muted-foreground">
            {summary.atRisk ? (
              <span className="flex items-center gap-1.5 text-c-amber-fg">
                <Warning size={13} aria-hidden="true" />
                {summary.atRisk} at risk
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-c-green-fg">
                <Check size={13} aria-hidden="true" />
                All on track
              </span>
            )}
            <span>{plural(summary.launchingThisWeek, "launch", "launches")} this week</span>
          </span>
        )}
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-3">
        {rows.map((r) => {
          const risk = today ? riskOf(r, today) : "";
          return (
            <Link
              key={r.id}
              href={`/capsules/${r.key.toLowerCase()}`}
              className="flex flex-col gap-2.5 rounded-2xl border border-border bg-surface p-4 text-foreground no-underline shadow-card transition-colors hover:border-border-strong motion-reduce:transition-none"
            >
              <span className="flex w-full items-start gap-2">
                <span className="grow leading-5 font-semibold">{r.name}</span>
                <StatusPill status={r.status} />
              </span>
              <Segments row={r} />
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarBlank size={12} aria-hidden="true" />
                {r.launchDate
                  ? `${fmtDate(r.launchDate)}${today ? ` · ${launchIn(r.launchDate, today)}` : ""}`
                  : "No launch date"}
              </span>
              {today &&
                (risk ? (
                  <RiskLine text={risk} />
                ) : (
                  <span className="text-xs text-c-green-fg">On track</span>
                ))}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
