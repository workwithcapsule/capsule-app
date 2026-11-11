"use client";

import { useState } from "react";
import Link from "next/link";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { AvatarStack } from "@/components/avatar";
import type { Person, SpaceSummary } from "@/lib/spaces";
import { MembershipButton, useMembership } from "./membership";
import { NewSpaceDialog } from "./new-space-dialog";

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/**
 * Browse spaces (design-decisions.md section 14, Nov 9), with Christina's
 * change: Your spaces first, then Other spaces. Each list is alphabetical.
 */
export function BrowseSpaces({
  initial,
  orgName,
  me,
}: {
  initial: SpaceSummary[];
  orgName: string;
  me: Person;
}) {
  const [spaces, setSpaces] = useState(initial);
  const [query, setQuery] = useState("");
  const { toggle, pending } = useMembership((id, joined, role) =>
    setSpaces((list) =>
      list.map((s) => {
        if (s.id !== id || s.joined === joined) return s;
        const members = joined
          ? [...s.members.filter((m) => m.id !== me.id), me]
          : s.members.filter((m) => m.id !== me.id);
        return { ...s, joined, myRole: role, members };
      }),
    ),
  );

  const q = query.trim().toLowerCase();
  const matches = (s: SpaceSummary) =>
    !q || `${s.name} ${s.keyPrefix} ${s.description ?? ""}`.toLowerCase().includes(q);
  const byName = (a: SpaceSummary, b: SpaceSummary) => a.name.localeCompare(b.name);
  const yours = spaces.filter((s) => s.joined && matches(s)).sort(byName);
  const others = spaces.filter((s) => !s.joined && matches(s)).sort(byName);
  const anyJoined = spaces.some((s) => s.joined);
  const anyOther = spaces.some((s) => !s.joined);

  const row = (s: SpaceSummary) => {
    const count = s.members.length;
    return (
      <li
        key={s.id}
        className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-divider px-[18px] py-3.5 first:border-t-0 min-[701px]:flex-nowrap"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="flex flex-wrap items-center gap-2">
            <Link
              href={`/spaces/${s.keyPrefix.toLowerCase()}`}
              className="text-[15px] font-semibold text-foreground no-underline hover:underline"
            >
              {s.name}
            </Link>
            <span className="font-mono text-xs text-muted-foreground">{s.keyPrefix}</span>
          </span>
          {s.description && (
            <span className="text-[13px] leading-[18px] text-muted-foreground">
              {s.description}
            </span>
          )}
        </div>
        <span className="order-3 flex w-full flex-none items-center gap-2 min-[701px]:order-none min-[701px]:w-auto">
          <AvatarStack people={s.members} />
          <span className="text-[13px] leading-[18px] text-muted-foreground">
            {plural(count, "member")} · {plural(s.capsuleCount, "capsule")}
          </span>
        </span>
        <MembershipButton space={s} disabled={pending} onToggle={() => toggle(s)} />
      </li>
    );
  };

  const empty = (text: string) => (
    <p className="rounded-2xl border border-dashed border-dash px-[18px] py-4 text-[13px] text-muted-foreground">
      {text}
    </p>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex h-[38px] w-full max-w-[360px] items-center gap-2 rounded-[10px] border border-border bg-surface px-3 text-muted-foreground focus-within:border-control">
          <MagnifyingGlass size={14} aria-hidden="true" />
          <span className="sr-only">Search spaces</span>
          <input
            type="text"
            placeholder="Search spaces"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-faint focus-visible:outline-none"
          />
        </label>
        <NewSpaceDialog takenPrefixes={spaces.map((s) => s.keyPrefix)} />
      </div>

      <section aria-labelledby="your-spaces" className="flex flex-col gap-3">
        <h2 id="your-spaces" className="text-base leading-6 font-semibold">
          Your spaces <span className="font-normal text-muted-foreground">{yours.length}</span>
        </h2>
        {yours.length ? (
          <ul className="rounded-2xl border border-border bg-surface shadow-card">
            {yours.map(row)}
          </ul>
        ) : anyJoined ? (
          empty(`None of your spaces match “${query.trim()}”.`)
        ) : (
          empty("You haven’t joined any spaces yet. Join one below to keep it in your sidebar.")
        )}
      </section>

      <section aria-labelledby="other-spaces" className="flex flex-col gap-3">
        <h2 id="other-spaces" className="text-base leading-6 font-semibold">
          Other spaces <span className="font-normal text-muted-foreground">{others.length}</span>
        </h2>
        {others.length ? (
          <ul className="rounded-2xl border border-border bg-surface shadow-card">
            {others.map(row)}
          </ul>
        ) : anyOther ? (
          empty(`No other spaces match “${query.trim()}”.`)
        ) : spaces.length ? (
          empty(`You’ve joined every space in ${orgName}.`)
        ) : (
          empty(`${orgName} doesn’t have any spaces yet. Create the first one with New space.`)
        )}
      </section>
    </div>
  );
}
