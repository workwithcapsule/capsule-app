"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import type { CapsuleRow } from "@/lib/capsules-list";
import { fmtDate, fmtRelative } from "@/lib/dates";
import { cn } from "@/lib/utils";

/* The Capsules page (prototype capsulesScreen): every capsule you created, work on or follow. */

type Filter = "all" | "created" | "working" | "following";
type Sort = "attention" | "launch" | "recent" | "name";

const FILTERS: [Filter, string][] = [
  ["all", "All"],
  ["created", "Created by me"],
  ["working", "Working on"],
  ["following", "Following"],
];

const SEG: Record<string, string> = {
  done: "bg-p-done",
  in_progress: "bg-p-prog",
  in_review: "bg-p-rev",
};
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

function progressLabel(r: CapsuleRow) {
  const total = r.componentStatuses.length;
  const done = r.componentStatuses.filter((k) => k.status === "done").length;
  if (r.status === "blocked") return "Blocked";
  if (r.status === "done" || (total && done === total)) return "Done";
  if (!r.componentStatuses.some((k) => k.status !== "not_started")) return "Not started";
  return `${done} of ${total} done`;
}

export function CapsulesTable({
  rows,
  spaces,
}: {
  rows: CapsuleRow[];
  spaces: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [space, setSpace] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("attention");

  const inSpace = rows.filter((r) => space === "all" || r.space.id === space);
  const matchesFilter = (r: CapsuleRow, f: Filter) => f === "all" || r[f];
  const q = query.trim().toLowerCase();
  const list = inSpace
    .filter((r) => matchesFilter(r, filter))
    .filter(
      (r) =>
        !q || `${r.name} ${r.key} ${r.owner?.name ?? ""} ${r.space.name}`.toLowerCase().includes(q),
    )
    .sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "recent") return b.updatedAt.localeCompare(a.updatedAt);
      const byLaunch = (a.launchDate ?? "9999").localeCompare(b.launchDate ?? "9999");
      return sort === "launch" ? byLaunch : b.needs - a.needs || byLaunch;
    });

  const clear = () => {
    setFilter("all");
    setSpace("all");
    setQuery("");
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map(([f, label]) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium",
              filter === f
                ? "border-primary bg-primary"
                : "border-border bg-surface hover:bg-subtle",
            )}
          >
            {label}{" "}
            <span className="text-muted-foreground">
              {inSpace.filter((r) => matchesFilter(r, f)).length}
            </span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex h-[38px] w-full max-w-[300px] items-center gap-2 rounded-[10px] border border-border bg-surface px-3 text-muted-foreground focus-within:border-control">
          <MagnifyingGlass size={14} aria-hidden="true" />
          <span className="sr-only">Search capsules</span>
          <input
            type="text"
            placeholder="Search by name, key or owner"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-faint focus-visible:outline-none"
          />
        </label>
        <label className="sr-only" htmlFor="caps-space">
          Space
        </label>
        <select
          id="caps-space"
          value={space}
          onChange={(e) => setSpace(e.target.value)}
          className="h-[38px] rounded-[10px] border border-border bg-surface px-2.5 text-sm outline-none focus:border-control"
        >
          <option value="all">All spaces</option>
          {spaces.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="caps-sort">
          Sort
        </label>
        <select
          id="caps-sort"
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="h-[38px] rounded-[10px] border border-border bg-surface px-2.5 text-sm outline-none focus:border-control"
        >
          <option value="attention">Needs you first</option>
          <option value="launch">Launch date</option>
          <option value="recent">Recently updated</option>
          <option value="name">Name A–Z</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-card">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-divider text-left text-xs leading-4 font-medium text-muted-foreground">
              <th scope="col" className="py-3 pr-3 pl-5 font-medium">
                Capsule
              </th>
              <th scope="col" className="w-40 px-3 py-3 font-medium">
                Owner
              </th>
              <th scope="col" className="w-[190px] px-3 py-3 font-medium">
                Progress
              </th>
              <th scope="col" className="w-24 px-3 py-3 font-medium">
                Launch
              </th>
              <th scope="col" className="w-[100px] px-3 py-3 font-medium">
                Needs you
              </th>
              <th scope="col" className="w-24 py-3 pr-5 pl-3 text-right font-medium">
                Updated
              </th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => {
              const href = `/capsules/${r.key.toLowerCase()}`;
              return (
                <tr
                  key={r.id}
                  onClick={() => router.push(href)}
                  className="cursor-pointer border-b border-divider last:border-b-0 hover:bg-hover"
                >
                  <td className="py-3.5 pr-3 pl-5">
                    <Link
                      href={href}
                      className="flex flex-col gap-0.5 text-foreground no-underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="font-medium">{r.name}</span>
                      <span className="text-xs text-muted-foreground">
                        <span className="font-mono">{r.key}</span> · {r.space.name}
                        {r.following && !r.working ? " · Following" : ""}
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-3.5">
                    {r.owner ? (
                      <span className="flex items-center gap-2 whitespace-nowrap">
                        <Avatar name={r.owner.name} initials={r.owner.initials} size={24} />
                        <span className="text-[13px]">{r.owner.name}</span>
                      </span>
                    ) : (
                      <span className="text-[13px] text-faint">No owner</span>
                    )}
                  </td>
                  <td className="px-3 py-3.5">
                    <div className="flex flex-col gap-1.5">
                      <div className="flex w-[140px] gap-[3px]" aria-hidden="true">
                        {r.componentStatuses.map((k, i) => (
                          <span
                            key={i}
                            title={k.name}
                            className={cn("h-1 flex-1 rounded-full bg-p-empty", SEG[k.status])}
                          />
                        ))}
                      </div>
                      <span className="text-xs text-muted-foreground">{progressLabel(r)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3.5 text-[13px] whitespace-nowrap">
                    {r.launchDate ? fmtDate(r.launchDate) : <span className="text-faint">—</span>}
                  </td>
                  <td className="px-3 py-3.5">
                    {r.needs ? (
                      <span className="inline-flex h-6 items-center rounded-full bg-subtle px-2.5 text-xs font-semibold">
                        {plural(r.needs, "item")}
                      </span>
                    ) : (
                      <span className="text-faint" aria-label="Nothing">
                        —
                      </span>
                    )}
                  </td>
                  <td
                    className="py-3.5 pr-5 pl-3 text-right text-xs whitespace-nowrap text-muted-foreground"
                    suppressHydrationWarning
                  >
                    {fmtRelative(r.updatedAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!list.length &&
          (rows.length ? (
            <div className="flex flex-col items-center gap-1.5 px-6 py-10 text-center">
              <p className="text-[15px] font-semibold">No capsules match</p>
              <p className="text-[13px] text-muted-foreground">
                Try a different search, or clear the filters.
              </p>
              <Button variant="link" onClick={clear}>
                Clear search and filters
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <p className="text-[15px] font-semibold">No capsules yet</p>
              <p className="text-[13px] text-muted-foreground">
                Capsules you create, work on or follow will appear here.
              </p>
              <Button asChild variant="primary" size="md">
                <Link href="/new">Start your first capsule</Link>
              </Button>
            </div>
          ))}
      </div>
      <p className="text-[13px] text-muted-foreground">
        {list.length === inSpace.length
          ? `${plural(inSpace.length, "capsule")}${space !== "all" ? ` in ${spaces.find((s) => s.id === space)?.name}` : ""}`
          : `Showing ${list.length} of ${plural(inSpace.length, "capsule")}`}
      </p>
    </div>
  );
}
