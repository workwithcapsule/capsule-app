"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowSquareOut, Kanban, MagnifyingGlass } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CapsuleData, LinkedIssue } from "@/lib/capsule-types";
import { cn } from "@/lib/utils";
import { searchJira, type JiraHit, type JiraSearch } from "../actions";

/*
 * Jira linking on the capsule page (step 14, design-decisions.md "Linking
 * Jira and monday items"): the picker on a component's "Add a work item"
 * line, and the tag a linked item carries.
 */

/** The Jira tag on a linked item: the issue key, opening the issue in Jira. */
export function JiraTag({ link, className }: { link: LinkedIssue; className?: string }) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noreferrer"
      title={`Open ${link.key} in Jira`}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "inline-flex h-5 flex-none items-center gap-1 rounded-md bg-c-blue pr-1.5 pl-1 font-mono text-[11px] leading-5 font-medium text-c-blue-fg no-underline hover:underline",
        className,
      )}
    >
      <Kanban size={12} aria-hidden="true" />
      {link.key}
      <span className="sr-only"> in Jira (opens in a new tab)</span>
    </a>
  );
}

/** Where "Connect Jira" brings someone back to: this capsule, this component. */
export function connectJiraHref(view: CapsuleData, componentId: string) {
  const back = `/capsules/${view.capsule.key.toLowerCase()}?component=${componentId}&linkjira=1`;
  return `/api/integrations/jira/connect?next=${encodeURIComponent(back)}`;
}

/**
 * The "Link from Jira" button and picker: search by key or title (arrow keys
 * and Enter), with issues already on this capsule shown as Linked.
 */
export function JiraLinkPicker({
  view,
  componentId,
  componentName,
  onLink,
  defaultOpen = false,
}: {
  view: CapsuleData;
  componentId: string;
  componentName: string;
  onLink: (hit: JiraHit) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<JiraSearch | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const seq = useRef(0);
  const linked = new Set(view.items.map((i) => i.link?.key).filter(Boolean) as string[]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  /** Searches Jira for `q`, after a short pause while typing. */
  function search(q: string, wait: number) {
    const n = ++seq.current;
    setLoading(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const r = await searchJira(q);
      if (n !== seq.current) return;
      setResult(r);
      setActive(0);
      setLoading(false);
    }, wait);
  }

  function changeOpen(next: boolean) {
    setOpen(next);
    if (next) search(query, 0);
  }

  // Opened straight away (back from connecting Jira): load recent issues.
  useEffect(() => {
    if (!defaultOpen) return;
    const t = setTimeout(() => search("", 0), 0);
    return () => clearTimeout(t);
  }, [defaultOpen]);

  const issues = result?.state === "ok" ? result.issues : [];
  const pick = (hit: JiraHit) => {
    if (linked.has(hit.key)) return;
    onLink(hit);
    setOpen(false);
    setQuery("");
  };
  const needsConnect =
    !view.jira.connected ||
    view.jira.reconnect ||
    result?.state === "not_connected" ||
    result?.state === "reconnect";

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="quiet"
          className="h-7 gap-1.5 px-2.5"
          aria-label={`Link a Jira issue to ${componentName}`}
          title="Link a Jira issue"
        >
          <Kanban size={14} aria-hidden="true" />
          <span className="max-sm:hidden">Jira</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(420px,calc(100vw-32px))] p-0">
        {needsConnect ? (
          <div className="flex flex-col gap-3 p-4">
            <p className="text-sm font-medium">
              {view.jira.reconnect || result?.state === "reconnect"
                ? "Connect Jira again"
                : "Connect your Jira account"}
            </p>
            <p className="text-[13px] leading-[18px] text-muted-foreground">
              {view.jira.reconnect || result?.state === "reconnect"
                ? "Jira stopped accepting Capsule’s connection. Connect again to search and link issues."
                : "Link issues to this capsule. You’ll only see issues you can see in Jira, and Capsule never changes anything there."}
            </p>
            <Button asChild variant="primary" size="md" className="self-start">
              <a href={connectJiraHref(view, componentId)}>Connect Jira</a>
            </Button>
          </div>
        ) : (
          <div className="flex flex-col">
            <label className="flex h-11 items-center gap-2 border-b border-divider px-3">
              <MagnifyingGlass size={14} className="text-muted-foreground" aria-hidden="true" />
              <span className="sr-only">Search Jira by key or title</span>
              <input
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  search(e.target.value, 250);
                }}
                placeholder="Search Jira by key or title"
                className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint focus-visible:outline-none"
                role="combobox"
                aria-expanded="true"
                aria-controls="jira-results"
                aria-activedescendant={issues[active] ? `jira-${issues[active].key}` : undefined}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActive((a) => Math.min(a + 1, issues.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActive((a) => Math.max(a - 1, 0));
                  } else if (e.key === "Enter" && issues[active]) {
                    e.preventDefault();
                    pick(issues[active]);
                  }
                }}
              />
            </label>
            <ul id="jira-results" role="listbox" className="max-h-72 overflow-y-auto p-1.5">
              {result?.state === "error" && (
                <li className="px-2.5 py-3 text-[13px] text-muted-foreground">
                  Jira didn’t answer. Try again in a moment.
                </li>
              )}
              {result?.state === "ok" && !issues.length && !loading && (
                <li className="px-2.5 py-3 text-[13px] text-muted-foreground">
                  {query ? "No issues match." : "Type a key or words from a title."}
                </li>
              )}
              {loading && !issues.length && (
                <li className="px-2.5 py-3 text-[13px] text-muted-foreground">Searching Jira…</li>
              )}
              {issues.map((hit, i) => {
                const already = linked.has(hit.key);
                return (
                  <li
                    key={hit.key}
                    id={`jira-${hit.key}`}
                    role="option"
                    aria-selected={i === active}
                    aria-disabled={already}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(hit)}
                    className={cn(
                      "flex cursor-default items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm",
                      i === active && "bg-hover",
                      already && "opacity-60",
                    )}
                  >
                    <span className="flex-none font-mono text-xs text-c-blue-fg">{hit.key}</span>
                    <span className="min-w-0 flex-1 truncate">{hit.title}</span>
                    <span className="flex-none text-xs text-muted-foreground">
                      {already ? "Linked" : hit.statusName}
                    </span>
                  </li>
                );
              })}
            </ul>
            {result?.state === "ok" && (
              <a
                href={result.site}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 border-t border-divider px-3 py-2 text-xs text-muted-foreground no-underline hover:text-foreground"
              >
                {view.jira.siteName ?? new URL(result.site).host}
                <ArrowSquareOut size={12} aria-hidden="true" />
              </a>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
